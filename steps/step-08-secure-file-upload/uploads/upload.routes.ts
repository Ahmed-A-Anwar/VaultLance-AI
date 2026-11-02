import { Router } from "express";
import { uploadMiddleware } from "./upload.middleware.js";
import { uploadService } from "./upload.service.js";
import { requireAuth } from "../middleware/auth.middleware.js";
import { requireRole } from "../authorization/role.middleware.js";
import { sendCreated, sendSuccess } from "../shared/response.js";
import { BadRequestError } from "../shared/errors.js";

const router = Router();

router.use(requireAuth);

// Upload deliverable to vault (Freelancer only)
router.post(
  "/:vaultId",
  requireRole("FREELANCER"),
  uploadMiddleware.single("file"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        throw new BadRequestError("No file uploaded. Key 'file' is required.", "MISSING_FILE");
      }

      const vaultId = String(req.params.vaultId);
      const result = await uploadService.processUpload({
        userId: req.user!.id,
        vaultId,
        file: req.file,
      });

      return sendCreated(res, result, "File uploaded and verified successfully");
    } catch (err) {
      next(err);
    }
  }
);

// Download file (Participant with access only)
router.get("/download/:fileId", async (req, res, next) => {
  try {
    const fileId = String(req.params.fileId);
    const { file, buffer } = await uploadService.getFileForDownload(
      req.user!.id,
      fileId
    );

    res.setHeader("Content-Type", file.mime_type);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(file.file_name)}"`
    );
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
});

export default router;
