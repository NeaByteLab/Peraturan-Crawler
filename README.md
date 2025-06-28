# Peraturan-Crawler

**Peraturan-Crawler** is an open-source utility that automates the crawling and downloading of legal PDF documents from [peraturan.go.id](https://peraturan.go.id). It performs robust crawling with retry, intelligent batch downloading, PDF validation, resume capability, and stores all found PDF files and their metadata locally for further processing or offline research.

---

## Features

- **Automated crawling** from a root URL (default: peraturan.go.id)
- **Smart, multi-level link discovery** (finds all PDF links recursively)
- **Batch PDF download with retry and validation**
- **PDF file validation** (not just download, but also check if the file is really a PDF)
- **Resume support** (safe to stop/restart; won't redownload completed files)
- **Metadata and progress logging** (JSON files for all results)
- **Colorized and timestamped logs**

---

## Requirements

- Node.js 16+
- NPM

---

## Getting Started

1. **Clone the repository**

```bash
git clone https://github.com/NeaByteLab/Peraturan-Crawler.git
cd Peraturan-Crawler
```

2. **Install dependencies**

```bash
npm install
```

3. **Run the crawler**

```bash
node index.js
```

The script will crawl from the default root (`https://peraturan.go.id`) and start downloading PDFs in batches into the `pdf_peraturan/` folder. All progress and metadata are saved in local JSON files (`all_pdf_metadata.json`, `resume_crawl.json`).

---

## How It Works (Flow)

1. **Crawling**
   - Starts from the given root URL.
   - Recursively finds all links (pages and PDFs) on the domain.
2. **PDF Discovery & Validation**
   - Every discovered PDF link is checked and scheduled for download.
   - Downloads are retried up to 3 times per file (configurable).
   - Each file is validated to ensure it's a real, readable PDF.
3. **Batch Download & Logging**
   - Downloads in batches (default: 5 concurrent files).
   - All progress (success/fail/skip) is logged in color to console and to local JSON for resume.
4. **Resume & Metadata**
   - If interrupted, rerun the script to resume unfinished jobs.
   - Metadata (source page, filename, local path, etc) is stored in `all_pdf_metadata.json`.

---

## Project Structure

```
.
├── index.js                # Main script: crawler & downloader
├── pdf_peraturan/          # All downloaded PDF files
├── all_pdf_metadata.json   # JSON metadata for all PDFs
├── resume_crawl.json       # Resume state
├── package.json
```

---

## Configuration

- **Default root:** `https://peraturan.go.id` (edit in `index.js` if needed)
- **Batch size:** Change `batchDownload` parameter in the script
- **Retry count:** Change `maxRetry` parameter in download/fetch functions

---

## License

MIT © [NeaByteLab](https://github.com/NeaByteLab)