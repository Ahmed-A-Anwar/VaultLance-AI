import multer from "multer";
import path from "path";
import { uploadConfig } from "./upload.config.js";
import { SecurityError } from "../shared/errors.js";

const storage = multer.memoryStorage();

const fileFilter: multer.Options["fileFilter"] = (_req, file, cb) => {
  const originalName = file.originalname;
  const ext = path.extname(originalName).toLowerCase();

  // Extension check against allowlist
  if (!uploadConfig.allowedExtensions.includes(ext)) {
    return cb(
      new SecurityError(
        `File extension '${ext}' is not permitted. Allowed extensions: ${uploadConfig.allowedExtensions.join(", ")}`,
        "DISALLOWED_FILE_EXTENSION"
      )
    );
  }

  // Double extension detection defense (e.g. file.php.png or file.exe.zip)
  const baseWithoutExt = path.basename(originalName, ext);
  const secondExt = path.extname(baseWithoutExt).toLowerCase();
  if (secondExt && uploadConfig.dangerousExtensions.includes(secondExt)) {
    return cb(
      new SecurityError(
        `Dangerous double extension detected in file name '${originalName}'.`,
        "DOUBLE_EXTENSION_ATTACK"
      )
    );
  }

  // MIME type check
  if (!uploadConfig.allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new SecurityError(
        `MIME type '${file.mimetype}' is not permitted.`,
        "DISALLOWED_MIME_TYPE"
      )
    );
  }

  cb(null, true);
};

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: uploadConfig.maxFileSize,
    files: 10,
  },
  fileFilter,
});
