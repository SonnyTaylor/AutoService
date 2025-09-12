/**
 * API functions for communicating with the backend.
 */

const { invoke } = window.__TAURI__.core;

/**
 * Runs a script using the backend.
 * @param {Object} script - The script object to run.
 * @returns {Promise} Promise that resolves when the script is executed.
 */
export async function runScript(script) {
  return await invoke("run_script", { script });
}

/**
 * Saves a script to the backend.
 * @param {Object} script - The script object to save.
 * @returns {Promise} Promise that resolves when the script is saved.
 */
export async function saveScript(script) {
  return await invoke("save_script", { script });
}

/**
 * Removes a script from the backend.
 * @param {string} id - The ID of the script to remove.
 * @returns {Promise} Promise that resolves when the script is removed.
 */
export async function removeScript(id) {
  return await invoke("remove_script", { id });
}

/**
 * Lists all scripts from the backend.
 * @returns {Promise<Array>} Promise that resolves to an array of script objects.
 */
export async function listScripts() {
  return await invoke("list_scripts");
}

/**
 * Gets data directories from the backend.
 * @returns {Promise<Object>} Promise that resolves to data directories object.
 */
export async function getDataDirs() {
  return await invoke("get_data_dirs");
}