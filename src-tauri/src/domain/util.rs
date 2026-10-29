use chrono::{SecondsFormat, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    Uuid::now_v7().to_string()
}

pub fn normalize_tag_name(name: &str) -> String {
    let mut out = String::with_capacity(name.len());
    let mut last_space = false;
    for ch in name.trim().chars() {
        if ch.is_whitespace() {
            if !last_space && !out.is_empty() {
                out.push(' ');
            }
            last_space = true;
        } else {
            for lower in ch.to_lowercase() {
                out.push(lower);
            }
            last_space = false;
        }
    }
    out
}

pub fn make_excerpt(text: &str, max_chars: usize) -> String {
    let mut out = String::with_capacity(max_chars + 1);
    let mut last_space = false;
    let mut count = 0;
    for ch in text.chars() {
        if ch.is_whitespace() {
            if !last_space && !out.is_empty() {
                out.push(' ');
                count += 1;
            }
            last_space = true;
        } else {
            out.push(ch);
            count += 1;
            last_space = false;
        }
        if count >= max_chars {
            out.push('…');
            break;
        }
    }
    out.trim().to_string()
}

pub fn count_words(text: &str) -> i64 {
    text.split_whitespace().count() as i64
}

/// Plain-text projection of a Tiptap/ProseMirror document.
pub fn doc_to_text(doc: &Value) -> String {
    let mut out = String::new();
    walk_text(doc, &mut out);
    collapse_blank_lines(&out)
}

fn walk_text(node: &Value, out: &mut String) {
    let kind = node.get("type").and_then(Value::as_str).unwrap_or_default();
    if kind == "text" {
        if let Some(text) = node.get("text").and_then(Value::as_str) {
            out.push_str(text);
        }
        return;
    }
    if kind == "hardBreak" {
        out.push('\n');
        return;
    }
    if let Some(content) = node.get("content").and_then(Value::as_array) {
        for child in content {
            walk_text(child, out);
        }
    }
    if matches!(
        kind,
        "paragraph"
            | "heading"
            | "blockquote"
            | "listItem"
            | "taskItem"
            | "codeBlock"
            | "callout"
            | "tableRow"
            | "tableCell"
            | "tableHeader"
            | "horizontalRule"
    ) {
        out.push('\n');
    }
}

fn collapse_blank_lines(text: &str) -> String {
    let mut out = String::with_capacity(text.len());
    let mut blank_run = 0;
    for line in text.lines() {
        let trimmed = line.trim_end();
        if trimmed.trim().is_empty() {
            blank_run += 1;
            if blank_run > 1 {
                continue;
            }
            out.push('\n');
        } else {
            blank_run = 0;
            out.push_str(trimmed);
            out.push('\n');
        }
    }
    out.trim().to_string()
}

/// Collects `note://<id>` targets from link marks and note-link nodes.
pub fn extract_note_links(doc: &Value) -> Vec<String> {
    fn walk(node: &Value, out: &mut Vec<String>) {
        if let Some(marks) = node.get("marks").and_then(Value::as_array) {
            for mark in marks {
                if mark.get("type").and_then(Value::as_str) != Some("link") {
                    continue;
                }
                let Some(href) = mark
                    .get("attrs")
                    .and_then(|attrs| attrs.get("href"))
                    .and_then(Value::as_str)
                else {
                    continue;
                };
                if let Some(id) = href.strip_prefix("note://") {
                    let id = id.trim();
                    if !id.is_empty() && !out.iter().any(|existing| existing == id) {
                        out.push(id.to_string());
                    }
                }
            }
        }
        if let Some(content) = node.get("content").and_then(Value::as_array) {
            for child in content {
                walk(child, out);
            }
        }
    }

    let mut out = Vec::new();
    walk(doc, &mut out);
    out
}

pub fn empty_doc() -> Value {
    serde_json::json!({
        "type": "doc",
        "content": [{ "type": "paragraph" }]
    })
}

pub fn validate_doc(doc: &Value) -> Result<(), String> {
    let Some(object) = doc.as_object() else {
        return Err("Document must be a JSON object".into());
    };
    if object.get("type").and_then(Value::as_str) != Some("doc") {
        return Err("Document root must be of type \"doc\"".into());
    }
    if let Some(content) = object.get("content") {
        if !content.is_array() {
            return Err("Document content must be an array".into());
        }
    }
    let size = serde_json::to_vec(doc).map(|v| v.len()).unwrap_or(usize::MAX);
    if size > 8 * 1024 * 1024 {
        return Err("Document exceeds the 8 MB limit".into());
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TagRef {
    pub id: String,
    pub name: String,
}

pub fn parse_tags(json: Option<String>) -> Vec<TagRef> {
    json.and_then(|raw| serde_json::from_str::<Vec<TagRef>>(&raw).ok())
        .unwrap_or_default()
}

/// FTS5 query built from untrusted input. Every token is quoted and escaped so
/// user punctuation can never produce a syntax error. Supports "quoted phrases"
/// and prefix matching on the final bare term.
pub fn build_match_query(input: &str) -> Option<String> {
    let trimmed = input.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut terms: Vec<(String, bool)> = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    let mut phrase = false;

    for ch in trimmed.chars().take(400) {
        match ch {
            '"' if current.is_empty() => {
                quoted = true;
                phrase = true;
            }
            '"' if quoted => {
                if !current.trim().is_empty() {
                    terms.push((current.trim().to_string(), true));
                }
                current.clear();
                quoted = false;
            }
            ch if ch.is_whitespace() && !quoted => {
                if !current.trim().is_empty() {
                    terms.push((current.trim().to_string(), phrase));
                }
                current.clear();
                phrase = false;
            }
            ch => current.push(ch),
        }
        if terms.len() >= 20 {
            break;
        }
    }
    if !current.trim().is_empty() {
        terms.push((current.trim().to_string(), phrase));
    }

    if terms.is_empty() {
        return None;
    }

    let last_index = terms.len() - 1;
    let mut parts = Vec::with_capacity(terms.len());
    for (index, (term, is_phrase)) in terms.iter().enumerate() {
        let cleaned: String = term.chars().filter(|c| !c.is_control()).collect();
        if cleaned.is_empty() {
            continue;
        }
        let escaped = cleaned.replace('"', "\"\"");
        if *is_phrase {
            parts.push(format!("\"{escaped}\""));
        } else if index == last_index {
            parts.push(format!("\"{escaped}\"*"));
        } else {
            parts.push(format!("\"{escaped}\""));
        }
    }

    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" AND "))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_names_are_normalized_and_collapsed() {
        assert_eq!(normalize_tag_name("  Unreal   Engine "), "unreal engine");
        assert_eq!(normalize_tag_name("C++"), "c++");
    }

    #[test]
    fn excerpts_respect_char_boundaries() {
        let text = "Unreal Engine uses a reflection system for Blueprints";
        let excerpt = make_excerpt(text, 20);
        assert!(excerpt.chars().count() <= 21);
        assert!(excerpt.ends_with('…'));
    }

    #[test]
    fn doc_text_extracts_blocks_and_text() {
        let doc = serde_json::json!({
            "type": "doc",
            "content": [
                {"type": "heading", "attrs": {"level": 1}, "content": [{"type": "text", "text": "Title"}]},
                {"type": "paragraph", "content": [{"type": "text", "text": "Body text"}]}
            ]
        });
        let text = doc_to_text(&doc);
        assert!(text.contains("Title"));
        assert!(text.contains("Body text"));
    }

    #[test]
    fn match_query_escapes_hostile_input() {
        let q = build_match_query("UE5 \"narrative pro\" -test (foo) OR bar*").unwrap();
        assert!(q.contains("\"UE5\""));
        assert!(q.contains("\"narrative pro\""));
        assert!(q.contains("\"bar*\"*"));
        assert!(!q.contains("OR "));
    }

    #[test]
    fn match_query_empty_for_punctuation_only() {
        assert!(build_match_query("   ").is_none());
    }

    #[test]
    fn validate_doc_rejects_non_documents() {
        assert!(validate_doc(&serde_json::json!({"type": "paragraph"})).is_err());
        assert!(validate_doc(&empty_doc()).is_ok());
    }

    #[test]
    fn note_links_are_extracted_and_deduplicated() {
        let doc = serde_json::json!({
            "type": "doc",
            "content": [{
                "type": "paragraph",
                "content": [
                    {"type": "text", "text": "a", "marks": [{"type": "link", "attrs": {"href": "note://one"}}]},
                    {"type": "text", "text": "b", "marks": [{"type": "link", "attrs": {"href": "note://one"}}]},
                    {"type": "text", "text": "c", "marks": [{"type": "link", "attrs": {"href": "https://example.com"}}]},
                    {"type": "text", "text": "d", "marks": [{"type": "link", "attrs": {"href": "note://two"}}]}
                ]
            }]
        });
        assert_eq!(extract_note_links(&doc), vec!["one", "two"]);
    }
}
