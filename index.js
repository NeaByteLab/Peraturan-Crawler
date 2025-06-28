const axios = require('axios')
const moment = require('moment')
const cheerio = require('cheerio')
const pdfParse = require('pdf-parse')
const path = require('path')
const fs = require('fs')
require('colors')

/**
 * Log With Timestamp And Color
 * @param {String} logType - Log Type
 * @param {any[]} logContent - Log Content Array
 */
function logWithTimeColor(logType, ...logContent) {
  let nowTime = moment().format('YYYY-MM-DD HH:mm:ss')
  let message = ['[' + nowTime + ']'].concat(logContent).join(' ')
  if (logType === 'success') {
    console.log(message.green)
  } else {
    if (logType === 'fail') {
      console.log(message.red)
    } else {
      if (logType === 'info') {
        console.log(message.blue)
      } else {
        if (logType === 'warn') {
          console.log(message.yellow)
        } else {
          console.log(message)
        }
      }
    }
  }
}

/**
 * Check PDF Valid
 * @param {String} filePath - PDF Path
 */
async function checkPdfValid(filePath) {
  if (!(fs.existsSync(filePath))) {
    return false
  } else {
    const stat = fs.statSync(filePath)
    if (!(stat.size > 1000)) {
      return false
    } else {
      try {
        const dataBuffer = fs.readFileSync(filePath)
        const pdfRes = await pdfParse(dataBuffer)
        if (pdfRes && pdfRes.numpages > 0) {
          return true
        } else {
          return false
        }
      } catch (err) {
        return false
      }
    }
  }
}

/**
 * Download PDF Batch With Retry
 * @param {Array} pdfBatchList - PDF List
 * @param {Number} maxRetry - Max Retry
 */
async function downloadPdfBatch(pdfBatchList, maxRetry = 3) {
  let successCount = 0
  let failCount = 0
  await Promise.all(pdfBatchList.map(async pdfInfo => {
    let attempt = 0
    let done = false
    while (attempt < maxRetry && !done) {
      attempt = attempt + 1
      try {
        const filePath = pdfInfo.localPath
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
        }
        const writerStream = fs.createWriteStream(filePath)
        const response = await axios.get(pdfInfo.url, { responseType: 'stream', timeout: 30000 })
        response.data.pipe(writerStream)
        await new Promise((resolve, reject) => {
          writerStream.on('finish', resolve)
          writerStream.on('error', reject)
        })
        const validPdf = await checkPdfValid(filePath)
        if (validPdf) {
          logWithTimeColor('success', '[Download Success]', pdfInfo.fileName, '<-', pdfInfo.fromPage)
          successCount = successCount + 1
          done = true
        } else {
          logWithTimeColor('fail', '[Corrupt]', pdfInfo.fileName, 'Retry', attempt)
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        }
      } catch (err) {
        logWithTimeColor('fail', '[Download Err]', pdfInfo.fileName, 'Retry', attempt)
      }
    }
    if (!(done)) {
      failCount = failCount + 1
    }
  }))
  return { successCount, failCount }
}

/**
 * Fetch Page HTML With Retry
 * @param {String} pageUrl - Page Url
 * @param {Number} maxRetry - Max Retry
 */
async function fetchPageHtmlWithRetry(pageUrl, maxRetry = 3) {
  let tryCount = 0
  while (tryCount < maxRetry) {
    try {
      const result = await axios.get(pageUrl, { timeout: 15000 })
      return result.data
    } catch (error) {
      tryCount = tryCount + 1
      if (tryCount < maxRetry) {
        logWithTimeColor('warn', '[Retry Fetch]', pageUrl, '(Try ' + (tryCount + 1) + ')')
        await new Promise(res => setTimeout(res, 2000))
      }
    }
  }
  return null
}

/**
 * Deep Crawl And Download PDF Per Batch
 * @param {String} startUrl - Root Url
 * @param {Boolean} skipDuplicate - Skip If Exists
 * @param {Number} batchDownload - Batch Download
 */
async function deepCrawlAndDownloadPdfPerBatch(startUrl, skipDuplicate = true, batchDownload = 5) {
  const downloadDir = path.join(__dirname, 'pdf_peraturan')
  if (!(fs.existsSync(downloadDir))) {
    fs.mkdirSync(downloadDir)
  }
  let queueUrl = [startUrl]
  let visitedUrl = new Set()
  let pdfInfoList = []
  let metaFile = 'all_pdf_metadata.json'
  let resumeFile = 'resume_crawl.json'
  let baseDomain = (new URL(startUrl)).host
  let totalSuccess = 0
  let totalFail = 0
  let pdfDone = new Set()
  if (fs.existsSync(resumeFile)) {
    const resumeData = JSON.parse(fs.readFileSync(resumeFile, 'utf8'))
    queueUrl = resumeData.queueUrl
    visitedUrl = new Set(resumeData.visitedUrl)
    pdfInfoList = resumeData.pdfInfoList
    pdfDone = new Set(resumeData.pdfDone)
    totalSuccess = resumeData.totalSuccess || 0
    totalFail = resumeData.totalFail || 0
    logWithTimeColor('warn', '[Resume]', 'Resume previous session, queue:', queueUrl.length)
  }
  while (queueUrl.length > 0) {
    const currentUrl = queueUrl.shift()
    if (!(currentUrl)) {
      continue
    } else {
      if (!(visitedUrl.has(currentUrl))) {
        visitedUrl.add(currentUrl)
        let htmlContent = await fetchPageHtmlWithRetry(currentUrl, 3)
        if (htmlContent) {
          const $ = cheerio.load(htmlContent)
          const pageTitle = $('title').text().trim() || 'No Title'
          let batchPromise = []
          $('a').each((i, el) => {
            let linkHref = $(el).attr('href')
            if (linkHref && linkHref.endsWith('.pdf')) {
              let absHref = linkHref
              if (!(linkHref.startsWith('http'))) {
                absHref = 'https://peraturan.go.id' + linkHref
              }
              const pdfFileName = path.basename(absHref.split('?')[0])
              const localPath = path.join(downloadDir, pdfFileName)
              let existIdx = pdfInfoList.findIndex(i => i.url === absHref)
              if (existIdx < 0) {
                let pdfInfo = {
                  url: absHref,
                  fileName: pdfFileName,
                  localPath: localPath,
                  fromPage: currentUrl,
                  title: pageTitle
                }
                pdfInfoList.push(pdfInfo)
                batchPromise.push(
                  (async () => {
                    if (skipDuplicate) {
                      const valid = await checkPdfValid(localPath)
                      if (valid) {
                        logWithTimeColor('warn', '[Skip Exists]', pdfFileName)
                        pdfDone.add(pdfFileName)
                        return
                      }
                    }
                    let res = await downloadPdfBatch([pdfInfo], 3)
                    if (res.successCount > 0) {
                      pdfDone.add(pdfFileName)
                      totalSuccess = totalSuccess + res.successCount
                    }
                    if (res.failCount > 0) {
                      totalFail = totalFail + res.failCount
                    }
                  })()
                )
                if (batchPromise.length >= batchDownload) {
                  let currBatch = batchPromise.slice()
                  batchPromise = []
                  Promise.all(currBatch).then(() => {
                    logWithTimeColor('info', '[Batch Download]', 'Downloaded:', pdfDone.size, '|', 'Success:', totalSuccess, '|', 'Fail:', totalFail)
                    fs.writeFileSync(resumeFile, JSON.stringify({
                      queueUrl,
                      visitedUrl: Array.from(visitedUrl),
                      pdfInfoList,
                      pdfDone: Array.from(pdfDone),
                      totalSuccess,
                      totalFail
                    }), 'utf8')
                  })
                }
              }
            } else {
              if (linkHref && !(linkHref.startsWith('http'))) {
                if (linkHref.startsWith('/')) {
                  if (!(linkHref.endsWith('.pdf'))) {
                    if (!(linkHref.startsWith('#'))) {
                      const fullUrl = 'https://peraturan.go.id' + linkHref
                      if (!(visitedUrl.has(fullUrl))) {
                        if (!(queueUrl.includes(fullUrl))) {
                          queueUrl.push(fullUrl)
                        }
                      }
                    }
                  }
                }
              } else {
                if (linkHref && (new URL(linkHref, startUrl)).host === baseDomain) {
                  if (!(linkHref.endsWith('.pdf'))) {
                    if (!(visitedUrl.has(linkHref))) {
                      if (!(queueUrl.includes(linkHref))) {
                        queueUrl.push(linkHref)
                      }
                    }
                  }
                }
              }
            }
          })
          if (batchPromise.length > 0) {
            await Promise.all(batchPromise)
            logWithTimeColor('info', '[Batch Download]', 'Downloaded:', pdfDone.size, '|', 'Success:', totalSuccess, '|', 'Fail:', totalFail)
          }
          logWithTimeColor('info', '[Crawled]', visitedUrl.size, '|', '[Queue]', queueUrl.length, '|', '[PDF Found]', pdfInfoList.length, '|', '[Downloaded]', pdfDone.size)
        } else {
          logWithTimeColor('fail', '[Fetch Fail]', currentUrl)
        }
        if ((visitedUrl.size % 10) === 0) {
          fs.writeFileSync(resumeFile, JSON.stringify({
            queueUrl,
            visitedUrl: Array.from(visitedUrl),
            pdfInfoList,
            pdfDone: Array.from(pdfDone),
            totalSuccess,
            totalFail
          }), 'utf8')
        }
      }
    }
  }
  fs.writeFileSync(metaFile, JSON.stringify(pdfInfoList, null, 2), 'utf8')
  if (fs.existsSync(resumeFile)) {
    fs.unlinkSync(resumeFile)
  }
  logWithTimeColor('success', '[All Done]', 'PDF downloaded:', pdfDone.size, '|', 'Success:', totalSuccess, '|', 'Fail:', totalFail)
}

deepCrawlAndDownloadPdfPerBatch('https://peraturan.go.id', true, 5)