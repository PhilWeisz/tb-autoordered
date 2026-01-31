import { parseEmailDomain } from './domainParser.js';
import { ensureSubfolder, safeName } from './folderUtils.js';

console.log("AutoOrdered (DEBUG): Background script loaded.");

// Configuration
const BATCH_SIZE = 200;
const ROOT_FOLDER_NAME = "autoordered";

// Cache to avoid re-fetching folders constantly (optional, currently cleared on run)
let folderCache = new Map();

// Verify API availability and attach listener
if (browser.action && browser.action.onClicked) {
    browser.action.onClicked.addListener(runSort);
    console.log("AutoOrdered (DEBUG): Listener attached to browser.action");
} else {
    console.error("AutoOrdered (DEBUG): browser.action API missing!");
}

async function runSort() {
  console.log("AutoOrdered (DEBUG): Button CLICKED. Starting sort...");
  folderCache.clear();

  try {
    // 1. Check permissions / Accounts
    const perms = await browser.permissions.getAll();
    console.log("AutoOrdered (DEBUG): Active permissions:", JSON.stringify(perms));

    // IMPORTANT: 'true' must be passed to see folders
    const accounts = await browser.accounts.list(true);
    console.log(`AutoOrdered (DEBUG): Found ${accounts.length} accounts.`);
    
    if (accounts.length > 0) {
       console.log("AutoOrdered (DEBUG): First account keys:", JSON.stringify(Object.keys(accounts[0])));
    }
    
    for (const account of accounts) {
      console.log(`AutoOrdered (DEBUG): Inspecting account '${account.name}'...`);
      await processAccount(account);
    }
    
    console.log("AutoOrdered: Sort complete.");
  } catch (err) {
    console.error("AutoOrdered: Fatal error during sort:", err);
  }
}

async function processAccount(account) {
  let searchRoots = account.folders;
  
  // FAILSAFE: If account.folders is missing, try account.rootFolder
  if ((!searchRoots || searchRoots.length === 0) && account.rootFolder) {
     console.log(`AutoOrdered (DEBUG): '${account.name}' missing 'folders'. checking rootFolder...`);
     
     // DEBUG: Inspect the rootFolder structure
     const rf = account.rootFolder;
     console.log(`AutoOrdered (DEBUG): rootFolder keys: [${Object.keys(rf).join(", ")}]`);
     
     if (rf.subFolders) {
        console.log(`AutoOrdered (DEBUG): rootFolder has ${rf.subFolders.length} subfolders: ${rf.subFolders.map(f => f.name).join(", ")}`);
        searchRoots = [rf];
     } else {
        console.warn(`AutoOrdered (DEBUG): rootFolder.subFolders is UNDEFINED. Cannot traverse tree.`);
        return;
     }
  }

  if (!searchRoots || searchRoots.length === 0) {
      console.warn(`AutoOrdered (DEBUG): SKIPPING '${account.name}' - Cannot find any folders.`);
      return;
  }

  // Find the inbox folder. Type can be 'inbox' or name 'Inbox'
  function findInboxRecursive(folders) {
    if (!folders) return null;
    for (let f of folders) {
      // Check type or name (case-insensitive)
      if (f.type === "inbox" || f.name.toLowerCase() === "inbox") {
          console.log(`AutoOrdered (DEBUG): Found Inbox candidates: ${f.name} (type: ${f.type})`);
          return f;
      }
      
      if (f.subFolders && f.subFolders.length > 0) {
        const found = findInboxRecursive(f.subFolders);
        if (found) return found;
      }
    }
    return null;
  }

  const inbox = findInboxRecursive(searchRoots);

  if (!inbox) {
    console.warn(`AutoOrdered: No Inbox found (type='inbox') for account ${account.name}`);
    return;
  }

  console.log(`AutoOrdered: Processing Inbox for ${account.name}`);
  await processFolder(inbox);
}

async function processFolder(inboxFolder) {
  // 1. Fetch all messages
  let messages = [];
  try {
      // FIX: Pass inboxFolder.id, not the whole object
      let page = await browser.messages.list(inboxFolder.id);
      messages = messages.concat(page.messages);
      
      while (page.id) {
        page = await browser.messages.continueList(page.id);
        messages = messages.concat(page.messages);
      }
  } catch (e) {
      console.error(`AutoOrdered: Error listing messages in ${inboxFolder.name}:`, e);
      return;
  }

  if (messages.length === 0) {
      console.log(`AutoOrdered: Inbox ${inboxFolder.name} is empty.`);
      return;
  }
  
  console.log(`AutoOrdered: Analying ${messages.length} messages in ${inboxFolder.name}...`);

  // 2. Group messages by Domain
  const groups = new Map(); // Key: fullDomain, Value: { meta: parsedDomain, ids: [msgId, ...] }

  for (const msg of messages) {
    // author is usually "Name <email@domain.com>"
    const parsed = parseEmailDomain(msg.author);
    if (!parsed) continue;

    const key = parsed.full;
    if (!groups.has(key)) {
      groups.set(key, { meta: parsed, ids: [] });
    }
    groups.get(key).ids.push(msg.id);
  }

  // 3. Filter groups (count > 1) & Move
  const toMove = Array.from(groups.values()).filter(g => g.ids.length > 1);

  if (toMove.length === 0) {
    console.log("AutoOrdered: No domains with multiple messages found to move.");
    return;
  }

  console.log(`AutoOrdered: Found ${toMove.length} domain groups to move.`);

  const rootAutoFolder = await ensureSubfolder(inboxFolder, ROOT_FOLDER_NAME);

  for (const group of toMove) {
    const { base, sub, full } = group.meta;

    // Hierarchy: ROOT / Letter / Base / Sub?
    
    // Level 1: Letter
    const letter = base.charAt(0).toLowerCase() || "_"; // fallback
    const letterFolder = await ensureSubfolder(rootAutoFolder, letter);

    // Level 2: Base Domain
    const baseFolder = await ensureSubfolder(letterFolder, base);

    // Level 3: Subdomain (Optional)
    let targetFolder = baseFolder;
    if (sub) {
      targetFolder = await ensureSubfolder(baseFolder, sub);
    }

    // Move in chunks
    const messageIds = group.ids;
    console.log(`AutoOrdered: Moving ${messageIds.length} messages from ${full} to ${targetFolder.path}`);

    for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
      const chunk = messageIds.slice(i, i + BATCH_SIZE);
      try {
        // Must use targetFolder.id (or path) for the API
        await browser.messages.move(chunk, targetFolder.id || targetFolder);
      } catch (e) {
        console.error(`AutoOrdered: Failed to move batch for ${full}:`, e);
      }
    }
  }
}