const archiver = require('archiver');
const fs = require('fs').promises;
const path = require('path');
const { db } = require('../database/db');
const { queueEmail } = require('./emailProcessor');
const logger = require('../utils/logger');
const feedbackService = require('./feedbackService');

const getStoragePath = () => process.env.STORAGE_PATH || path.join(__dirname, '../../../storage');
const ACTIVE_PATH = () => path.join(getStoragePath(), 'events/active');
const ARCHIVE_PATH = () => path.join(getStoragePath(), 'events/archived');

async function archiveEvent(event) {
  try {
    const eventPath = path.join(ACTIVE_PATH(), event.slug);
    const archiveName = `${event.slug}.zip`;
    const archivePath = path.join(ARCHIVE_PATH(), archiveName);
    
    // Ensure archive directory exists
    await fs.mkdir(ARCHIVE_PATH(), { recursive: true });
    
    // Create archive
    const output = require('fs').createWriteStream(archivePath);
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });
    
    archive.on('error', (err) => {
      throw err;
    });
    
    // Export feedback data before archiving
    const feedbackSettings = await feedbackService.getEventFeedbackSettings(event.id);
    if (feedbackSettings.feedback_enabled) {
      try {
        logger.info(`Exporting feedback data for event ${event.slug}`);
        const feedbackData = await feedbackService.exportEventFeedback(event.id);
        
        if (feedbackData && feedbackData.length > 0) {
          // Create feedback JSON file
          const feedbackJson = JSON.stringify(feedbackData, null, 2);
          const feedbackJsonPath = path.join(eventPath, 'feedback_data.json');
          await fs.writeFile(feedbackJsonPath, feedbackJson, 'utf8');
          
          // Create feedback CSV file
          const feedbackCsv = convertToCSV(feedbackData);
          const feedbackCsvPath = path.join(eventPath, 'feedback_data.csv');
          await fs.writeFile(feedbackCsvPath, feedbackCsv, 'utf8');
          
          // Create feedback summary
          const summary = await feedbackService.getEventFeedbackSummary(event.id);
          const summaryPath = path.join(eventPath, 'feedback_summary.json');
          await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), 'utf8');
          
          logger.info(`Feedback data exported: ${feedbackData.length} entries`);
        }
      } catch (error) {
        logger.error(`Error exporting feedback for event ${event.slug}:`, error);
        // Continue with archiving even if feedback export fails
      }
    }

    // Write a photos manifest into the archive so a future restore can recover per-photo
    // metadata (original_filename, category) that can't be derived from the renamed gallery
    // files. Without this, restore loses original_filename.
    try {
      const manifestPhotos = await db('photos')
        .leftJoin('photo_categories', 'photos.category_id', 'photo_categories.id')
        .where('photos.event_id', event.id)
        .select(
          'photos.filename',
          'photos.original_filename',
          'photos.type',
          'photos.uploaded_at',
          'photo_categories.name as category_name'
        );
      const manifestPath = path.join(eventPath, 'photos_manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifestPhotos, null, 2), 'utf8');
      logger.info(`Photos manifest written: ${manifestPhotos.length} entries`);
    } catch (error) {
      logger.error(`Error writing photos manifest for event ${event.slug}:`, error);
      // Continue archiving even if manifest write fails
    }

    output.on('close', async () => {
      logger.info(`Archive created: ${archiveName} (${archive.pointer()} bytes)`);
      
      // Update database
      await db('events').where('id', event.id).update({
        is_archived: true,
        archive_path: path.relative(getStoragePath(), archivePath),
        archived_at: new Date()
      });
      
      // Delete original files
      await fs.rm(eventPath, { recursive: true });
      
      // Delete thumbnails
      const photos = await db('photos').where('event_id', event.id);
      for (const photo of photos) {
        if (photo.thumbnail_path) {
          const thumbPath = path.join(getStoragePath(), photo.thumbnail_path);
          await fs.unlink(thumbPath).catch(() => {}); // Ignore if already deleted
        }
      }
      
      // Queue completion email
      await queueEmail(event.id, event.admin_email, 'archive_complete', {
        event_name: event.event_name,
        archive_size: (archive.pointer() / 1024 / 1024).toFixed(2) + ' MB'
      });
    });
    
    archive.pipe(output);
    archive.directory(eventPath, false);
    await archive.finalize();
    
  } catch (error) {
    logger.error(`Error archiving event ${event.slug}:`, error);
    throw error;
  }
}

// Helper function to convert JSON to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvHeaders = headers.join(',');
  
  const csvRows = data.map(row => {
    return headers.map(header => {
      const value = row[header];
      // Escape quotes and wrap in quotes if contains comma
      if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value || '';
    }).join(',');
  });
  
  return [csvHeaders, ...csvRows].join('\n');
}

module.exports = { archiveEvent };
