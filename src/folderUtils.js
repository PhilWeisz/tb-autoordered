/**
 * Sanitizes a folder name.
 * Replaces \ / and control chars with _.
 * Trims leading/trailing dots.
 * Limits to ~120 chars.
 * @param {string} name 
 * @returns {string}
 */
export function safeName(name) {
  if (!name) return "unknown";
  
  // Replace \ / with _
  let sanitized = name.replace(/[\\\/]/g, '_');
  
  // Replace control chars with _ (ASCII 0-31, 127)
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '_');
  
  // Trim leading/trailing dots
  sanitized = sanitized.replace(/^\.+|\.+$/g, '');
  
  // Limit length
  if (sanitized.length > 120) {
    sanitized = sanitized.substring(0, 120);
  }
  
  return sanitized || "unknown";
}

/**
 * Ensures a subfolder exists under the given parent.
 * Checks existing folders first to avoid duplication.
 * @param {object} parentFolder - The parent folder object from API.
 * @param {string} name - The desired name of the subfolder.
 * @returns {Promise<object>} The found or created folder object.
 */
export async function ensureSubfolder(parentFolder, name) {
  const sanitizedName = safeName(name);
  
  // Prefer using ID to avoid object type mismatches in strict environments
  const parentId = parentFolder.id || parentFolder;

  try {
    const subFolders = await browser.folders.getSubFolders(parentId);
    const existing = subFolders.find(f => f.name === sanitizedName);
    
    if (existing) {
      return existing;
    }
    
    // Create if not found - pass ID explicitly
    return await browser.folders.create(parentId, sanitizedName);
  } catch (err) {
    console.error(`AutoOrdered: Error creating subfolder '${sanitizedName}' in '${parentFolder.name || parentId}':`, err);
    throw err;
  }
}
