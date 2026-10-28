const { uploads } = require('./env');

const maxFiles = 20;
const maxBytes = Math.min(uploads.internalMaxBytes, 1024 ** 3);
const maxTotalBytes = maxFiles * maxBytes;

// Shared by multipart parsing, create/edit validation, and form options.
function validateInternalFiles(files) {
  const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!files.length || files.length > maxFiles) invalid(`Pilih 1 sampai ${maxFiles} file.`);
  const sizes = files.map(file => Number(file.size ?? file.file_size));
  if (sizes.some(size => !Number.isSafeInteger(size) || size <= 0 || size > maxBytes)) {
    invalid('Ukuran berkas melebihi batas per file atau berkas kosong.');
  }
  if (sizes.reduce((sum, size) => sum + size, 0) > maxTotalBytes) invalid('Total ukuran berkas melebihi batas aset.');
}

module.exports = { maxFiles, maxBytes, maxTotalBytes, validateInternalFiles };
