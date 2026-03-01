pub mod rubrics;

use std::collections::HashMap;
use std::path::Path;
use tracing;

#[derive(Debug, Clone)]
pub struct BuildingGrade {
    pub stars: u8,
    pub reasoning: String,
    pub graded_at: u64,
    pub grading: bool,
}

pub struct GradingService {
    pub api_key: Option<String>,
    pub grades: HashMap<String, BuildingGrade>,
}

impl GradingService {
    pub fn new() -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        if api_key.is_some() {
            tracing::info!("ANTHROPIC_API_KEY found, grading enabled");
        } else {
            tracing::warn!("ANTHROPIC_API_KEY not set, grading disabled");
        }
        Self {
            api_key,
            grades: HashMap::new(),
        }
    }

    pub fn set_api_key(&mut self, key: String) {
        self.api_key = Some(key);
        tracing::info!("API key set for grading service");
    }

    pub fn has_api_key(&self) -> bool {
        self.api_key.is_some()
    }

    pub fn mark_grading(&mut self, building_id: &str) {
        if let Some(grade) = self.grades.get_mut(building_id) {
            grade.grading = true;
        } else {
            self.grades.insert(
                building_id.to_string(),
                BuildingGrade {
                    stars: 0,
                    reasoning: String::new(),
                    graded_at: 0,
                    grading: true,
                },
            );
        }
    }

    pub fn set_grade(&mut self, building_id: &str, stars: u8, reasoning: String, tick: u64) {
        self.grades.insert(
            building_id.to_string(),
            BuildingGrade {
                stars,
                reasoning,
                graded_at: tick,
                grading: false,
            },
        );
    }

    pub fn get_multiplier(&self, building_id: &str) -> f64 {
        match self.grades.get(building_id) {
            None => 1.0,
            Some(grade) => {
                // While grading for the first time (no previous result), keep default multiplier
                if grade.grading && grade.stars == 0 {
                    return 1.0;
                }
                match grade.stars {
                    0 => 0.0,
                    1 => 0.5,
                    2 => 1.0,
                    3 => 2.0,
                    4 => 3.0,
                    5 => 5.0,
                    6 => 10.0,
                    _ => 1.0,
                }
            }
        }
    }
}

pub fn read_project_sources(project_dir: &Path) -> Result<Vec<(String, String)>, String> {
    let allowed_extensions = ["ts", "tsx", "js", "jsx", "css", "html", "json", "svg"];
    let skip_dirs = ["node_modules", "dist", ".git", ".next", "build", "coverage", ".turbo"];
    let skip_files = ["package-lock.json", "yarn.lock", "pnpm-lock.yaml"];
    let max_total_size: usize = 100_000; // ~100KB

    let mut results: Vec<(String, String)> = Vec::new();
    let mut total_size: usize = 0;

    fn walk_dir(
        dir: &Path,
        base: &Path,
        allowed_extensions: &[&str],
        skip_dirs: &[&str],
        skip_files: &[&str],
        results: &mut Vec<(String, String)>,
        total_size: &mut usize,
        max_total_size: usize,
    ) -> Result<(), String> {
        let entries = std::fs::read_dir(dir).map_err(|e| format!("Failed to read dir {:?}: {}", dir, e))?;

        for entry in entries {
            let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
            let path = entry.path();
            let file_name = entry.file_name();
            let name = file_name.to_string_lossy();

            if path.is_dir() {
                if skip_dirs.contains(&name.as_ref()) {
                    continue;
                }
                walk_dir(&path, base, allowed_extensions, skip_dirs, skip_files, results, total_size, max_total_size)?;
            } else if path.is_file() {
                if skip_files.contains(&name.as_ref()) {
                    continue;
                }

                let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");
                if !allowed_extensions.contains(&ext) {
                    continue;
                }

                if *total_size >= max_total_size {
                    break;
                }

                let contents = std::fs::read_to_string(&path)
                    .map_err(|e| format!("Failed to read file {:?}: {}", path, e))?;

                let relative = path
                    .strip_prefix(base)
                    .unwrap_or(&path)
                    .to_string_lossy()
                    .to_string();

                *total_size += contents.len();
                results.push((relative, contents));

                if *total_size >= max_total_size {
                    break;
                }
            }
        }
        Ok(())
    }

    walk_dir(
        project_dir,
        project_dir,
        &allowed_extensions,
        &skip_dirs,
        &skip_files,
        &mut results,
        &mut total_size,
        max_total_size,
    )?;

    results.sort_by(|a, b| a.0.cmp(&b.0));
    Ok(results)
}

pub async fn grade_with_claude(
    api_key: &str,
    building_id: &str,
    building_name: &str,
    building_description: &str,
    sources: &[(String, String)],
) -> Result<(u8, String), String> {
    let rubric = rubrics::get_rubric(building_id);

    let mut source_text = String::new();
    for (path, content) in sources {
        source_text.push_str(&format!("\n--- FILE: {} ---\n{}\n", path, content));
    }

    let prompt = format!(
        r#"You are grading a web application project. The building type is "{}" ({}).

{}

Here are the source files of the project:
{}

Grade this project on a scale of 0 to 6 stars based on the rubric above. 0 stars means the project is empty or completely broken.

You MUST respond with ONLY a JSON object in this exact format, no other text:
{{"stars": N, "reasoning": "Brief explanation of the grade"}}"#,
        building_name, building_description, rubric, source_text
    );

    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 300,
        "messages": [
            {
                "role": "user",
                "content": prompt
            }
        ]
    });

    let response = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Claude API returned {}: {}", status, text));
    }

    let resp_json: serde_json::Value = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response JSON: {}", e))?;

    let content_text = resp_json["content"][0]["text"]
        .as_str()
        .ok_or_else(|| "No text in Claude response".to_string())?;

    // Parse the JSON from Claude's response
    let parsed: serde_json::Value = serde_json::from_str(content_text.trim())
        .map_err(|e| format!("Failed to parse Claude's JSON response: {}. Raw: {}", e, content_text))?;

    let stars = parsed["stars"]
        .as_u64()
        .ok_or_else(|| format!("No 'stars' field in response: {}", content_text))?;
    let stars = stars.min(6) as u8;

    let reasoning = parsed["reasoning"]
        .as_str()
        .unwrap_or("No reasoning provided")
        .to_string();

    Ok((stars, reasoning))
}
