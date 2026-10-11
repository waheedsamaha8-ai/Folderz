// @ts-nocheck
import { Project, ProjectLog, Task, MarketItem } from '../types';

export interface SheetsInitResult {
  id: string;
  url: string;
}

class GoogleSheetsService {
  private opQueue: Promise<any> = Promise.resolve();
  private inFlightSheets = new Map<string, Promise<string | null>>();

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.opQueue.then(() => task(), () => task());
    this.opQueue = next.catch(() => {});
    return next;
  }

  public getSpreadsheetUrl(spreadsheetId?: string): string | null {
    if (spreadsheetId) return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
    return null;
  }

  public colIndexToLetter(colIndex: number): string {
    let temp, letter = '';
    while (colIndex >= 0) {
      temp = colIndex % 26;
      letter = String.fromCharCode(temp + 65) + letter;
      colIndex = Math.floor(colIndex / 26) - 1;
    }
    return letter || 'A';
  }

  private extractDriveFileId(urlOrId: string): string | null {
    if (!urlOrId || typeof urlOrId !== 'string') return null;
    const trimmed = urlOrId.trim();
    if (trimmed.startsWith('data:')) return null;
    const m0 = trimmed.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]+)/);
    if (m0 && m0[1]) return m0[1];
    const m1 = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m1 && m1[1]) return m1[1];
    const m2 = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m2 && m2[1]) return m2[1];
    const m3 = trimmed.match(/files\/([a-zA-Z0-9_-]+)/);
    if (m3 && m3[1]) return m3[1];
    if (/^[a-zA-Z0-9_-]{20,60}$/.test(trimmed)) return trimmed;
    return null;
  }

  private buildImageCellFormula(imgUrl: string, index: number): string {
    if (!imgUrl || typeof imgUrl !== 'string') return '';
    const fileId = this.extractDriveFileId(imgUrl);
    if (fileId) {
      const viewUrl = `https://drive.google.com/file/d/${fileId}/view`;
      return `=HYPERLINK("${viewUrl}", "عرض صورة ${index}")`;
    }
    if (imgUrl.startsWith('http://') || imgUrl.startsWith('https://')) {
      return `=HYPERLINK("${imgUrl}", "عرض صورة ${index}")`;
    }
    return '';
  }

  private formatProjectLogSheetRow(log: ProjectLog, isDeleted: boolean = false): any[] {
    const images: string[] = Array.isArray(log.images) ? log.images : (log.images ? [log.images] : []);
    const isDel = isDeleted || log.isDeleted;

    const driveLinks = images.map((img) => {
      const fid = this.extractDriveFileId(img);
      return fid ? `https://drive.google.com/file/d/${fid}/view` : img;
    }).filter(Boolean).join('\n');

    const img1 = this.buildImageCellFormula(images[0] || '', 1);
    const img2 = this.buildImageCellFormula(images[1] || '', 2);
    const img3 = this.buildImageCellFormula(images[2] || '', 3);
    const img4 = this.buildImageCellFormula(images[3] || '', 4);
    const img5 = this.buildImageCellFormula(images[4] || '', 5);
    const img6 = this.buildImageCellFormula(images[5] || '', 6);

    return [
      log.id,
      log.date || '',
      log.content || '',
      driveLinks,
      img1,
      img2,
      img3,
      img4,
      img5,
      img6,
      log.createdAt || new Date().toISOString(),
      isDel ? 'محذوف' : (log.status || 'نشط')
    ];
  }

  /**
   * Finds the dedicated Google Spreadsheet file inside a portfolio's folder.
   * Cleans up any duplicate spreadsheet files if found.
   */
  public async findProjectSpreadsheetId(parentFolderId: string, accessToken: string): Promise<string | null> {
    if (!accessToken || !parentFolderId) return null;
    try {
      const query = `'${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,webViewLink,createdTime)&orderBy=createdTime asc`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (searchRes.ok) {
        const data = await searchRes.json();
        const files: any[] = data.files || [];
        if (files.length > 0) {
          const primaryId = files[0].id;
          // Deduplicate if more than 1 spreadsheet exists in the folder
          if (files.length > 1) {
            for (let i = 1; i < files.length; i++) {
              fetch(`https://www.googleapis.com/drive/v3/files/${files[i].id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${accessToken}` }
              }).catch(() => {});
            }
          }
          return primaryId;
        }
      }
    } catch (e) {
      console.warn("Error searching for project spreadsheet", e);
    }
    return null;
  }

  /**
   * Ensures a dedicated Google Spreadsheet database exists inside the portfolio's Drive folder.
   * Uses mutex lock to guarantee zero duplicate creations even under race conditions.
   */
  public async ensureProjectSpreadsheet(project: Project, accessToken: string): Promise<string | null> {
    if (!accessToken || !project) return null;
    const parentFolderId = project.driveFolderId || project.id;
    if (!parentFolderId) return null;

    if (this.inFlightSheets.has(parentFolderId)) {
      return this.inFlightSheets.get(parentFolderId)!;
    }

    const task = (async (): Promise<string | null> => {
      const sheetName = `قاعدة بيانات الحافظة - ${project.name || 'الحافظة'}`;

      try {
        // 1. Search if project folder already contains the spreadsheet file
        const existingId = await this.findProjectSpreadsheetId(parentFolderId, accessToken);
        if (existingId) {
          await this.syncProjectDataToSpreadsheet(project, accessToken, existingId);
          return existingId;
        }

        // 2. Create new per-portfolio Google Spreadsheet
        const createPayload = {
          properties: {
            title: sheetName,
            locale: 'ar_EG',
            autoRecalc: 'ON_CHANGE'
          },
          sheets: [
            { properties: { title: 'بيانات الحافظة', gridProperties: { frozenRowCount: 1 } } },
            { properties: { title: 'سجل الحافظة', gridProperties: { frozenRowCount: 1 } } }
          ]
        };

        const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(createPayload)
        });

        if (!createRes.ok) return null;
        const createdData = await createRes.json();
        const newSheetId = createdData.spreadsheetId;

        // Move spreadsheet file into the portfolio's folder
        try {
          const fileMetaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${newSheetId}?fields=parents`, {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          let previousParents = '';
          if (fileMetaRes.ok) {
            const meta = await fileMetaRes.json();
            if (meta.parents && meta.parents.length > 0) {
              previousParents = meta.parents.filter((p: string) => p !== parentFolderId).join(',');
            }
          }
          const updateUrl = previousParents
            ? `https://www.googleapis.com/drive/v3/files/${newSheetId}?addParents=${parentFolderId}&removeParents=${previousParents}`
            : `https://www.googleapis.com/drive/v3/files/${newSheetId}?addParents=${parentFolderId}`;
          await fetch(updateUrl, {
            method: 'PATCH',
            headers: { Authorization: `Bearer ${accessToken}` }
          });
        } catch (e) {}

        // Write Header Rows & Initial Project Master Data
        await this.syncProjectDataToSpreadsheet(project, accessToken, newSheetId);

        // Write initial logs headers
        const logHeaders = [[
          'المعرف', 'تاريخ اليوميات', 'يوميات الحافظة والسجل', 'روابط الصور في درايف',
          'معاينة صورة 1', 'معاينة صورة 2',
          'معاينة صورة 3', 'معاينة صورة 4',
          'معاينة صورة 5', 'معاينة صورة 6',
          'تاريخ التسجيل', 'حالة اليومية'
        ]];

        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/سجل%20الحافظة!A1:L1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: logHeaders })
        });

        // If project has existing logs, populate them
        if (project.executionLogs && project.executionLogs.length > 0) {
          const rows = project.executionLogs.map(l => this.formatProjectLogSheetRow(l));
          await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newSheetId}/values/سجل%20الحافظة!A2:L?valueInputOption=USER_ENTERED`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ values: rows })
          });
        }

        return newSheetId;
      } catch(e) {
        console.warn("Failed to create per-portfolio Google Sheet", e);
        return null;
      }
    })();

    this.inFlightSheets.set(parentFolderId, task);
    try {
      const res = await task;
      return res;
    } finally {
      this.inFlightSheets.delete(parentFolderId);
    }
  }

  /**
   * Updates 'بيانات الحافظة' tab inside dedicated portfolio spreadsheet with ALL portfolio fields & custom fields
   */
  public async syncProjectDataToSpreadsheet(project: Project, accessToken: string, sheetIdParam?: string): Promise<void> {
    if (!accessToken || !project) return;
    const parentFolderId = project.driveFolderId || project.id;
    const sheetId = sheetIdParam || (await this.findProjectSpreadsheetId(parentFolderId, accessToken));
    if (!sheetId) return;

    try {
      const customFieldKeys = (project.customFields || []).map((f: any) => f.key || f.name).filter(Boolean);
      const customFieldValues = (project.customFields || []).map((f: any) => f.value || '');

      const masterDataHeaders = [
        'المعرف',
        'اسم الحافظة',
        'نوع وتصنيف الحافظة',
        'العنوان / الموقع',
        'خط العرض (Lat)',
        'خط الطول (Lng)',
        'ملاحظات ووصف الحافظة',
        'تاريخ الإنشاء',
        'تاريخ آخر تحديث',
        'معرف مجلد Drive',
        ...customFieldKeys
      ];

      const projRow = [
        project.id,
        project.name || '',
        project.category || 'general',
        project.location || '',
        project.lat !== undefined ? project.lat.toString() : '',
        project.lng !== undefined ? project.lng.toString() : '',
        project.fullDescription || '',
        project.createdAt || new Date().toISOString(),
        new Date().toISOString(),
        project.driveFolderId || project.id,
        ...customFieldValues
      ];

      const lastCol = this.colIndexToLetter(masterDataHeaders.length - 1);

      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchUpdate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          valueInputOption: 'USER_ENTERED',
          data: [
            {
              range: `بيانات الحافظة!A1:${lastCol}1`,
              values: [masterDataHeaders]
            },
            {
              range: `بيانات الحافظة!A2:${lastCol}2`,
              values: [projRow]
            }
          ]
        })
      });
    } catch (e) {
      console.warn("Failed to sync project master data to dedicated sheet", e);
    }
  }

  /**
   * Adds an execution log to the portfolio's dedicated Google Spreadsheet.
   */
  public async addExecutionLog(projectId: string, log: ProjectLog, accessToken: string, project?: Project): Promise<void> {
    const parentFolderId = project?.driveFolderId || projectId;
    let sheetId = await this.findProjectSpreadsheetId(parentFolderId, accessToken);
    if (!sheetId && project) {
      sheetId = await this.ensureProjectSpreadsheet(project, accessToken);
    }
    if (!sheetId) return;

    try {
      const projRow = this.formatProjectLogSheetRow(log);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/سجل%20الحافظة!A:L:append?valueInputOption=USER_ENTERED`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ values: [projRow] })
      });
    } catch (e) {
      console.warn("Failed to add execution log to dedicated sheet", e);
    }
  }

  /**
   * Updates an existing execution log in the portfolio's dedicated Google Spreadsheet.
   */
  public async updateExecutionLog(projectId: string, log: ProjectLog, accessToken: string, project?: Project): Promise<void> {
    const parentFolderId = project?.driveFolderId || projectId;
    const sheetId = await this.findProjectSpreadsheetId(parentFolderId, accessToken);
    if (!sheetId) return;

    try {
      const readRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/سجل%20الحافظة!A2:A`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!readRes.ok) return;
      const readData = await readRes.json();
      const logIds = (readData.values || []).map((r: any[]) => r[0]);
      const idx = logIds.indexOf(log.id);

      if (idx >= 0) {
        const rowNum = idx + 2;
        const row = this.formatProjectLogSheetRow(log);
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/سجل%20الحافظة!A${rowNum}:L${rowNum}?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [row] })
        });
      } else {
        await this.addExecutionLog(projectId, log, accessToken, project);
      }
    } catch (e) {
      console.warn("Failed to update log in dedicated sheet", e);
    }
  }

  /**
   * Marks an execution log as deleted in the portfolio's dedicated Google Spreadsheet:
   * Sets Column L (حالة اليومية) to 'محذوف' and colors the row red.
   */
  public async deleteExecutionLog(projectId: string, logId: string, accessToken: string, project?: Project): Promise<void> {
    const parentFolderId = project?.driveFolderId || projectId;
    const sheetId = await this.findProjectSpreadsheetId(parentFolderId, accessToken);
    if (!sheetId) return;

    try {
      const readRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/سجل%20الحافظة!A1:L`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!readRes.ok) return;
      const readData = await readRes.json();
      const rows: any[][] = readData.values || [];

      let targetIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (rows[i] && rows[i][0] === logId) {
          targetIndex = i;
          break;
        }
      }

      if (targetIndex > 0) {
        const rowNum = targetIndex + 1;
        // Update status column to 'محذوف'
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/سجل%20الحافظة!L${rowNum}?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [['محذوف']] })
        });

        // Color row in Red
        const metaRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties(sheetId,title)`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (metaRes.ok) {
          const metaJson = await metaRes.json();
          const targetSheet = (metaJson.sheets || []).find((s: any) => s.properties?.title === 'سجل الحافظة');
          if (targetSheet) {
            const numericSheetId = targetSheet.properties.sheetId;
            const repeatCellReq = {
              repeatCell: {
                range: {
                  sheetId: numericSheetId,
                  startRowIndex: rowNum - 1,
                  endRowIndex: rowNum,
                  startColumnIndex: 0,
                  endColumnIndex: 12
                },
                cell: {
                  userEnteredFormat: {
                    backgroundColor: { red: 1.0, green: 0.88, blue: 0.88 },
                    textFormat: { foregroundColor: { red: 0.72, green: 0.05, blue: 0.05 }, bold: true }
                  }
                },
                fields: 'userEnteredFormat(backgroundColor,textFormat)'
              }
            };
            await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`, {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ requests: [repeatCellReq] })
            });
          }
        }
      }
    } catch (e) {
      console.warn("Failed to mark log deleted in dedicated sheet", e);
    }
  }

  /**
   * Retrieves images recorded for a specific log in the portfolio's Google Spreadsheet.
   */
  public async getLogImages(projectId: string, logId: string, accessToken: string, project?: Project): Promise<string[]> {
    const parentFolderId = project?.driveFolderId || projectId;
    const sheetId = await this.findProjectSpreadsheetId(parentFolderId, accessToken);
    if (!sheetId) return [];

    try {
      const readRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/سجل%20الحافظة!A2:D`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      if (!readRes.ok) return [];
      const data = await readRes.json();
      const rows: any[][] = data.values || [];
      const targetRow = rows.find(r => r[0] === logId);
      if (targetRow && targetRow[3]) {
        return targetRow[3].split('\n').map((s: string) => s.trim()).filter(Boolean);
      }
    } catch (e) {}
    return [];
  }

  /**
   * Fetches latest changes made directly on Google Sheets for a specific portfolio.
   */
  public async fetchProjectSpreadsheetData(projectId: string, driveFolderId: string, accessToken: string): Promise<Partial<Project> | null> {
    if (!accessToken || !projectId) return null;
    const parentFolderId = driveFolderId || projectId;

    const sheetId = await this.findProjectSpreadsheetId(parentFolderId, accessToken);
    if (!sheetId) return null;

    try {
      // Read both 'بيانات الحافظة' and 'سجل الحافظة'
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values:batchGet?ranges=بيانات%20الحافظة!A1:Z2&ranges=سجل%20الحافظة!A2:L`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!res.ok) return null;
      const sheetData = await res.json();
      const valRanges = sheetData.valueRanges || [];

      const masterRows = valRanges[0]?.values || [];
      const logRows = valRanges[1]?.values || [];

      const result: Partial<Project> = {};

      if (masterRows.length > 0) {
        const headers: string[] = masterRows[0] || [];
        const values: any[] = masterRows[1] || [];

        for (let i = 0; i < headers.length; i++) {
          const h = (headers[i] || '').trim();
          const val = values[i] !== undefined ? values[i].toString() : '';

          if (h === 'اسم الحافظة') result.name = val;
          else if (h === 'نوع وتصنيف الحافظة' || h === 'التصنيف') result.category = val;
          else if (h === 'العنوان / الموقع' || h === 'الموقع') result.location = val;
          else if (h === 'خط العرض (Lat)') result.lat = val ? parseFloat(val) : undefined;
          else if (h === 'خط الطول (Lng)') result.lng = val ? parseFloat(val) : undefined;
          else if (h === 'ملاحظات ووصف الحافظة' || h === 'الوصف' || h === 'ملاحظات / وصف الحافظة') result.fullDescription = val;
          else if (h === 'تاريخ الإنشاء') result.createdAt = val;
        }

        // Parse custom field columns (index >= 10 or headers not built-in)
        const standardHeaders = [
          'المعرف', 'اسم الحافظة', 'نوع وتصنيف الحافظة', 'التصنيف', 'العنوان / الموقع', 'الموقع',
          'خط العرض (Lat)', 'خط الطول (Lng)', 'ملاحظات ووصف الحافظة', 'الوصف', 'ملاحظات / وصف الحافظة',
          'تاريخ الإنشاء', 'تاريخ آخر تحديث', 'معرف مجلد Drive'
        ];
        const customFields: any[] = [];
        for (let i = 0; i < headers.length; i++) {
          const h = (headers[i] || '').trim();
          if (h && !standardHeaders.includes(h)) {
            customFields.push({
              id: `cf_sheet_${i}`,
              key: h,
              value: values[i] !== undefined ? values[i].toString() : ''
            });
          }
        }
        if (customFields.length > 0) {
          result.customFields = customFields;
        }
      }

      // Parse logs from 'سجل الحافظة'
      if (logRows.length > 0) {
        const parsedLogs: ProjectLog[] = [];
        for (const row of logRows) {
          if (!row || !row[0]) continue;
          const [id, date, content, driveLinks, img1, img2, img3, img4, img5, img6, createdAt, statusVal] = row;
          const isDeleted = (statusVal || '').toString().includes('محذوف');

          let images: string[] = [];
          if (driveLinks && typeof driveLinks === 'string') {
            images = driveLinks.split('\n').map(s => s.trim()).filter(Boolean);
          }

          parsedLogs.push({
            id: id.toString().trim(),
            date: date ? date.toString().trim() : '',
            content: content ? content.toString() : '',
            images,
            createdAt: createdAt ? createdAt.toString() : new Date().toISOString(),
            isDeleted,
            status: isDeleted ? 'محذوف' : (statusVal || 'نشط')
          });
        }
        if (parsedLogs.length > 0) {
          result.executionLogs = parsedLogs;
        }
      }

      return result;
    } catch(e) {
      console.warn("Failed to fetch project spreadsheet data", e);
      return null;
    }
  }

  /**
   * Scans Google Drive for all portfolio folders and loads each portfolio from its dedicated database.
   */
  public async discoverAllProjectsFromDrive(rootFolderId: string, accessToken: string): Promise<Project[]> {
    if (!accessToken || !rootFolderId) return [];
    try {
      const query = `'${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
      const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,createdTime,modifiedTime)&pageSize=100`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });

      if (!searchRes.ok) return [];
      const data = await searchRes.json();
      const folders: any[] = data.files || [];

      const projects: Project[] = [];

      for (const folder of folders) {
        if (!folder.name || folder.name === 'الأرشيف' || folder.name === 'Archive' || folder.name.startsWith('.')) continue;

        let projData = await this.fetchProjectSpreadsheetData(folder.id, folder.id, accessToken);
        
        const fullProj: Project = {
          id: folder.id,
          name: projData?.name || folder.name,
          driveFolderId: folder.id,
          category: projData?.category || 'general',
          location: projData?.location || '',
          lat: projData?.lat,
          lng: projData?.lng,
          fullDescription: projData?.fullDescription || '',
          createdAt: projData?.createdAt || folder.createdTime || new Date().toISOString(),
          updatedAt: folder.modifiedTime || new Date().toISOString(),
          customFields: projData?.customFields || [],
          executionLogs: projData?.executionLogs || []
        };

        projects.push(fullProj);
      }

      return projects;
    } catch (e) {
      console.warn("Error discovering projects from Drive folders", e);
      return [];
    }
  }
}

export const googleSheetsService = new GoogleSheetsService();
