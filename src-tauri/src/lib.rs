// M1: shell only. DuckDB / file commands arrive in M3 (register them in generate_handler!).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running VizTailor");
}
