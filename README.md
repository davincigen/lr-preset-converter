# Lightroom Preset Converter

A clean, modern web app to convert Lightroom preset files between `.lrtemplate`, `.xmp`, and `.dng` (with practical limits noted below).

## Features

- Drag-and-drop or file-picker upload
- Batch queue for multiple files
- Auto format detection
- Conversion output selector
- Per-file status + progress indicator
- Single download or batch ZIP download
- Friendly error messaging
- Lightweight backend API (Express + Multer memory storage)

## Technical Notes

- `.lrtemplate` and `.xmp` conversions preserve parsed preset keys/values.
- `.dng` input is supported by reading embedded XMP metadata when available.
- Output to `.dng` currently supports pass-through from `.dng` source files only.

## Run locally

```bash
npm install
npm run dev
```

Frontend: `http://localhost:5173`
API: `http://localhost:8787`

## Deploy on Vercel (no card)

1. Push this repo to GitHub.
2. Import the repo in Vercel.
3. Keep project root as repository root.
4. Vercel will use `vercel.json`:
   - Install: `npm install`
   - Build: `npm run build`
   - Output: `client/dist`
5. Deploy.

Serverless API routes used by the app:
- `POST /api/convert`
- `GET /api/health`

## API

`POST /api/convert`
- `multipart/form-data`
- `file`: preset file
- `outputFormat`: `lrtemplate | xmp | dng`

Returns converted file binary with headers:
- `X-Detected-Format`
- `X-Output-Filename`
- `X-Settings-Count`
