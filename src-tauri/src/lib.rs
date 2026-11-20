use base64::Engine;
use tauri_plugin_dialog::DialogExt;

/// Save bytes to a path the user picks in the native save dialog.
///
/// The browser's `Blob` + `<a download>` route does not reach a real save
/// dialog inside the Tauri webview, so the desktop build asks the OS for a
/// destination instead. The path always comes from the native dialog, so the
/// command never writes anywhere the user did not point at.
///
/// `base64_data` carries the payload because Tauri's IPC marshals command
/// arguments as JSON, where raw bytes would expand into an array of numbers.
#[tauri::command]
async fn save_bytes(
  app: tauri::AppHandle,
  filename: String,
  extension: Option<String>,
  label: Option<String>,
  base64_data: String,
) -> Result<Option<String>, String> {
  let mut builder = app.dialog().file().set_file_name(&filename);

  if let Some(extension) = extension.as_deref() {
    let label = label.unwrap_or_else(|| extension.to_uppercase());
    builder = builder.add_filter(label, &[extension]);
  }

  let Some(picked) = builder.blocking_save_file() else {
    // The user closed the dialog. Not an error.
    return Ok(None);
  };

  let path = picked.into_path().map_err(|error| error.to_string())?;
  let bytes = base64::engine::general_purpose::STANDARD
    .decode(base64_data)
    .map_err(|error| error.to_string())?;

  std::fs::write(&path, bytes).map_err(|error| error.to_string())?;

  Ok(Some(path.to_string_lossy().to_string()))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_http::init())
    .plugin(tauri_plugin_clipboard_manager::init())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      app.handle().plugin(
        tauri_plugin_log::Builder::default()
          .level(if cfg!(debug_assertions) {
            log::LevelFilter::Debug
          } else {
            log::LevelFilter::Info
          })
          .build(),
      )?;
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![save_bytes])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
