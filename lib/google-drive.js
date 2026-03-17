const { google } = require("googleapis");

const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  scopes: ["https://www.googleapis.com/auth/drive.readonly"],
});

const drive = google.drive({ version: "v3", auth });

// Shared Drive
const driveFlags = {
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
};

async function getWikiData(rootFolderId) {
  try {
    const folderRes = await drive.files.list({
      q: `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    const categories = [];

    for (const folder of folderRes.data.files) {
      const docRes = await drive.files.list({
        q: `'${folder.id}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
        fields: "files(id, name)",
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
      });

      if (docRes.data.files.length > 0) {
        categories.push({
          name: folder.name,
          docs: docRes.data.files,
        });
      }
    }

    return categories;
  } catch (err) {
    console.error("❌ Drive Fetch Error:", err);
    throw err;
  }
}

async function getDocContent(fileId) {
  const res = await drive.files.export({
    fileId: fileId,
    mimeType: "text/html",
  });
  return res.data;
}

async function getDocMetadata(fileId) {
  const res = await drive.files.get({
    fileId: fileId,
    fields: "name, parents",
    ...driveFlags,
  });

  let categoryName = "Wiki";
  if (res.data.parents && res.data.parents.length > 0) {
    const folder = await drive.files.get({
      fileId: res.data.parents[0],
      fields: "name",
      ...driveFlags,
    });
    categoryName = folder.data.name;
  }
  return { docName: res.data.name, categoryName };
}

async function getDocComments(fileId) {
  try {
    const res = await drive.comments.list({
      fileId: fileId,
      fields: "comments(content, author(displayName), createdTime, resolved)",
      ...driveFlags,
    });
    return res.data.comments.filter((c) => !c.resolved);
  } catch (err) {
    return [];
  }
}

module.exports = { getWikiData, getDocContent, getDocMetadata, getDocComments };
