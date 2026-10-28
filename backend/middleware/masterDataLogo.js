const fs = require("fs/promises");
const { logoUpload } = require("./upload");
const { validateUploadSignature } = require("./validateUploadSignature");
const { ensureUploadCapacity } = require("../config/storage");

const validateLogoPayload = (req, res, next) => {
  req.body ||= {};
  const multipart = Boolean(req.is("multipart/form-data"));
  if (multipart) {
    for (const field of ["isPublic", "is_public", "removeLogo"]) {
      if (req.body[field] === "true") req.body[field] = true;
      else if (req.body[field] === "false") req.body[field] = false;
    }
  }
  for (const field of ["isPublic", "is_public", "removeLogo"]) {
    if (req.body[field] !== undefined && typeof req.body[field] !== "boolean") {
      return res.status(400).json({ error: `Nilai ${field} tidak valid.` });
    }
  }
  if (req.file && req.body.removeLogo) return res.status(400).json({ error: "Pilih unggah logo baru atau hapus logo, bukan keduanya." });
  return next();
};

// Authentication and existing write permissions run before this middleware.
const masterDataLogo = (req, res, next) => {
  // A failed save must not leave a new upload behind. Do not clean on connection
  // close: a database commit may still be in progress after a client disconnects.
  res.once("finish", () => {
    if (res.statusCode >= 400 && req.file && !req.logoSaved) {
      fs.unlink(req.file.path).catch(() => undefined);
    }
  });
  if (!req.is("multipart/form-data")) return validateLogoPayload(req, res, next);
  return ensureUploadCapacity(req, res, capacityError => {
    if (capacityError) return next(capacityError);
    return logoUpload.single("logo")(req, res, uploadError => {
      if (uploadError) return res.status(uploadError.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
        error: uploadError.code === "LIMIT_FILE_SIZE" ? "Ukuran logo maksimal 2 MB." : uploadError.message,
      });
      return validateUploadSignature(req, res, signatureError => {
        if (signatureError) return next(signatureError);
        return validateLogoPayload(req, res, next);
      });
    });
  });
};

module.exports = { masterDataLogo };
