use crate::domain::util::{new_id, now_iso};
use crate::error::{AppError, AppResult};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;

const TEMPLATES_VERSION: &str = "1";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TemplateSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon: String,
    pub is_builtin: bool,
    pub sort_order: i64,
}

fn heading(level: u8, text: &str) -> Value {
    json!({
        "type": "heading",
        "attrs": { "level": level, "blockId": format!("tpl-h{level}-{}", text.to_lowercase().replace(' ', "-")) },
        "content": [{ "type": "text", "text": text }]
    })
}

fn paragraph(text: &str) -> Value {
    if text.is_empty() {
        json!({ "type": "paragraph" })
    } else {
        json!({ "type": "paragraph", "content": [{ "type": "text", "text": text }] })
    }
}

fn bullet_list(items: &[&str]) -> Value {
    json!({
        "type": "bulletList",
        "content": items.iter().map(|item| json!({
            "type": "listItem",
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": *item }] }]
        })).collect::<Vec<_>>()
    })
}

fn task_list(items: &[&str]) -> Value {
    json!({
        "type": "taskList",
        "content": items.iter().map(|item| json!({
            "type": "taskItem",
            "attrs": { "checked": false },
            "content": [{ "type": "paragraph", "content": [{ "type": "text", "text": *item }] }]
        })).collect::<Vec<_>>()
    })
}

fn code_block(text: &str) -> Value {
    json!({
        "type": "codeBlock",
        "attrs": { "language": "cpp" },
        "content": [{ "type": "text", "text": text }]
    })
}

fn doc(content: Vec<Value>) -> Value {
    json!({ "type": "doc", "content": content })
}

struct Builtin {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    icon: &'static str,
    sort_order: i64,
    doc: Value,
}

fn builtins() -> Vec<Builtin> {
    vec![
        Builtin {
            id: "tpl-blank",
            name: "Blank note",
            description: "An empty page for quick thoughts.",
            icon: "file-text",
            sort_order: 0,
            doc: doc(vec![paragraph("")]),
        },
        Builtin {
            id: "tpl-technical",
            name: "Technical note",
            description: "How a system works, with room for code and edge cases.",
            icon: "cpu",
            sort_order: 1,
            doc: doc(vec![
                heading(1, "Overview"),
                paragraph("One paragraph summary of the system and why it exists."),
                heading(2, "Context"),
                bullet_list(&[
                    "Where this lives in the project",
                    "What it replaces or depends on",
                    "Constraints that shaped the design",
                ]),
                heading(2, "How it works"),
                paragraph("Walk through the flow from entry point to result."),
                heading(2, "Code"),
                code_block("// Key functions, signatures, and gotchas"),
                heading(2, "Edge cases"),
                bullet_list(&["Failure modes", "Limits", "Things that surprised me"]),
                heading(2, "Open questions"),
                task_list(&["Follow up on...", "Verify..."]) ,
                heading(2, "References"),
                bullet_list(&["Engine source paths", "Docs and talks"]),
            ]),
        },
        Builtin {
            id: "tpl-adr",
            name: "Design decision",
            description: "Record a choice, the alternatives, and the consequences.",
            icon: "git-branch",
            sort_order: 2,
            doc: doc(vec![
                heading(1, "Decision"),
                paragraph("State the decision in one sentence."),
                heading(2, "Status"),
                paragraph("Proposed"),
                heading(2, "Context"),
                paragraph("What forces are at play? What breaks if we do nothing?"),
                heading(2, "Alternatives considered"),
                bullet_list(&["Option A — tradeoffs", "Option B — tradeoffs"]),
                heading(2, "Consequences"),
                bullet_list(&["What becomes easier", "What becomes harder", "What we accept as debt"]),
                heading(2, "Follow-ups"),
                task_list(&["Update documentation", "Tell the team"]),
            ]),
        },
        Builtin {
            id: "tpl-bug",
            name: "Bug investigation",
            description: "Reproduction, root cause, fix, verification.",
            icon: "bug",
            sort_order: 3,
            doc: doc(vec![
                heading(1, "Summary"),
                paragraph("What is broken, observed where, and how bad is it?"),
                heading(2, "Expected vs actual"),
                bullet_list(&["Expected: ", "Actual: "]),
                heading(2, "Reproduction"),
                task_list(&["Step one", "Step two", "Step three"]),
                heading(2, "Root cause"),
                paragraph("The real cause, not the symptom."),
                heading(2, "Fix"),
                code_block("// Patch or callstack"),
                heading(2, "Verification"),
                bullet_list(&["Test added", "Manual check", "Regression risk"]),
            ]),
        },
        Builtin {
            id: "tpl-meeting",
            name: "Meeting notes",
            description: "Attendees, agenda, decisions, action items.",
            icon: "users",
            sort_order: 4,
            doc: doc(vec![
                heading(1, "Meeting"),
                paragraph("Date, attendees, and the goal of the session."),
                heading(2, "Agenda"),
                bullet_list(&["Topic one", "Topic two"]),
                heading(2, "Decisions"),
                bullet_list(&["Decision and owner"]),
                heading(2, "Action items"),
                task_list(&["Owner — task — due date"]),
            ]),
        },
        Builtin {
            id: "tpl-level",
            name: "Level / feature design",
            description: "Player experience, beats, systems, and dependencies.",
            icon: "map",
            sort_order: 5,
            doc: doc(vec![
                heading(1, "Goal"),
                paragraph("The experience the player should have."),
                heading(2, "Beats"),
                bullet_list(&["Intro", "Rising tension", "Climax", "Resolution"]),
                heading(2, "Systems involved"),
                bullet_list(&["Game mode", "Game state", "Player controller"]),
                heading(2, "Content and assets"),
                bullet_list(&["Levels", "Animations", "Audio"]),
                heading(2, "Open questions"),
                task_list(&["Resolve dependency"]),
            ]),
        },
        Builtin {
            id: "tpl-snippet",
            name: "Code snippet",
            description: "A reusable pattern with usage notes.",
            icon: "code",
            sort_order: 6,
            doc: doc(vec![
                heading(1, "Purpose"),
                paragraph("What problem this snippet solves."),
                heading(2, "Snippet"),
                code_block("// Paste code here"),
                heading(2, "Usage"),
                bullet_list(&["Where to call it", "Required setup"]),
                heading(2, "API notes"),
                bullet_list(&["Parameters", "Return values", "Lifetime / ownership"]),
            ]),
        },
    ]
}

pub async fn seed_builtins(pool: &SqlitePool) -> AppResult<()> {
    let current: Option<String> =
        sqlx::query_scalar("SELECT value FROM app_meta WHERE key = 'templates_version'")
            .fetch_optional(pool)
            .await?;
    if current.as_deref() == Some(TEMPLATES_VERSION) {
        return Ok(());
    }

    let now = now_iso();
    let mut tx = pool.begin().await?;
    for builtin in builtins() {
        sqlx::query(
            "INSERT INTO templates (id, name, description, icon, doc, doc_schema, is_builtin,
                                    sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 1, ?6, ?7, ?7)
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                description = excluded.description,
                icon = excluded.icon,
                doc = excluded.doc,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at
             WHERE templates.is_builtin = 1",
        )
        .bind(builtin.id)
        .bind(builtin.name)
        .bind(builtin.description)
        .bind(builtin.icon)
        .bind(builtin.doc.to_string())
        .bind(builtin.sort_order)
        .bind(&now)
        .execute(&mut *tx)
        .await?;
    }
    sqlx::query(
        "INSERT INTO app_meta (key, value, updated_at) VALUES ('templates_version', ?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(TEMPLATES_VERSION)
    .bind(&now)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(())
}

pub async fn list(pool: &SqlitePool) -> AppResult<Vec<TemplateSummary>> {
    let rows: Vec<(String, String, String, String, i64, i64)> = sqlx::query_as(
        "SELECT id, name, description, icon, is_builtin, sort_order
           FROM templates ORDER BY sort_order, lower(name)",
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|(id, name, description, icon, is_builtin, sort_order)| TemplateSummary {
            id,
            name,
            description,
            icon,
            is_builtin: is_builtin != 0,
            sort_order,
        })
        .collect())
}

pub async fn save_from_note(pool: &SqlitePool, note_id: &str, name: &str) -> AppResult<TemplateSummary> {
    let name = name.trim();
    if name.is_empty() {
        return Err(AppError::validation("Template name cannot be empty"));
    }
    if name.chars().count() > 80 {
        return Err(AppError::validation("Template name is too long (max 80)"));
    }

    let doc: Option<String> = sqlx::query_scalar("SELECT doc FROM notes WHERE id = ?1")
        .bind(note_id)
        .fetch_optional(pool)
        .await?;
    let Some(doc) = doc else {
        return Err(AppError::NotFound {
            entity: "note",
            id: note_id.to_string(),
        });
    };

    let duplicate: Option<i64> = sqlx::query_scalar(
        "SELECT 1 FROM templates WHERE lower(name) = lower(?1)",
    )
    .bind(name)
    .fetch_optional(pool)
    .await?;
    if duplicate.is_some() {
        return Err(AppError::conflict(format!(
            "A template named \"{name}\" already exists"
        )));
    }

    let id = new_id();
    let now = now_iso();
    let sort_order: i64 =
        sqlx::query_scalar("SELECT COALESCE(max(sort_order), 0) + 1 FROM templates")
            .fetch_one(pool)
            .await?;
    sqlx::query(
        "INSERT INTO templates (id, name, description, icon, doc, doc_schema, is_builtin,
                                sort_order, created_at, updated_at)
         VALUES (?1, ?2, '', 'file-plus', ?3, 1, 0, ?4, ?5, ?5)",
    )
    .bind(&id)
    .bind(name)
    .bind(doc)
    .bind(sort_order)
    .bind(&now)
    .execute(pool)
    .await?;

    Ok(TemplateSummary {
        id,
        name: name.to_string(),
        description: String::new(),
        icon: "file-plus".into(),
        is_builtin: false,
        sort_order,
    })
}

pub async fn delete(pool: &SqlitePool, id: &str) -> AppResult<()> {
    let builtin: Option<i64> = sqlx::query_scalar("SELECT is_builtin FROM templates WHERE id = ?1")
        .bind(id)
        .fetch_optional(pool)
        .await?;
    match builtin {
        None => Err(AppError::NotFound {
            entity: "template",
            id: id.to_string(),
        }),
        Some(1) => Err(AppError::validation("Built-in templates cannot be deleted")),
        Some(_) => {
            sqlx::query("DELETE FROM templates WHERE id = ?1")
                .bind(id)
                .execute(pool)
                .await?;
            Ok(())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::test_pool;
    use crate::domain::notes;

    #[tokio::test]
    async fn seeding_is_idempotent_and_creates_seven_templates() {
        let pool = test_pool().await;
        seed_builtins(&pool).await.unwrap();
        seed_builtins(&pool).await.unwrap();
        let all = list(&pool).await.unwrap();
        assert_eq!(all.len(), 7);
        assert!(all.iter().all(|template| template.is_builtin));
    }

    #[tokio::test]
    async fn notes_can_be_created_from_a_template() {
        let pool = test_pool().await;
        seed_builtins(&pool).await.unwrap();
        let note = notes::create(&pool, None, Some("tpl-technical".into()))
            .await
            .unwrap();
        assert!(note.summary.word_count > 0);
    }
}
