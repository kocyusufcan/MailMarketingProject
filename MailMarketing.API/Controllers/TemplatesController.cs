using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using System.Security.Claims;
using MailMarketing.API.Models;
using MailMarketing.Business;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class TemplatesController : ControllerBase
{
    private int GetCurrentUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

    // 1. Kullanıcının şablonlarını listele
    [HttpGet]
    public IActionResult GetTemplates()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var templates = db.Templates
                             .Where(t => t.UserId == userId)
                             .OrderByDescending(t => t.CreatedDate)
                             .ToList();
            return Ok(templates);
        }
    }

    // 1.1. Tek bir şablon getir (Düzenleme için)
    [HttpGet("{id}")]
    public IActionResult GetTemplate(int id)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var template = db.Templates.FirstOrDefault(t => t.Id == id && t.UserId == userId);
            if (template == null) return NotFound();
            return Ok(template);
        }
    }

    // 2. Yeni şablon ekle
    [HttpPost]
    public IActionResult CreateTemplate([FromBody] Template model)
    {
        var userId = GetCurrentUserId();
        if (string.IsNullOrEmpty(model.Title)) return BadRequest(new { message = "Başlık boş olamaz." });

        using (var db = new MailMarketingContext())
        {
            model.UserId = userId;
            model.CreatedDate = DateTime.Now;
            model.IsActive = true;
            
            db.Templates.Add(model);
            db.SaveChanges();
            LogManager.LogAction(userId, "Yeni Şablon Oluşturuldu", $"'{model.Title}' adlı yeni mail şablonu sisteme eklendi.");
            return Ok(model);
        }
    }

    // 3. Şablon sil (Kullanılmıyorsa tamamen siler)
    [HttpDelete("{id}")]
    public IActionResult DeleteTemplate(int id)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var template = db.Templates.FirstOrDefault(t => t.Id == id && t.UserId == userId);
            if (template == null) return NotFound();

            // Şablon daha önce kullanılmış mı kontrol et
            var isUsed = db.MailLogs.Any(log => log.TemplateId == id);
            if (isUsed)
            {
                return BadRequest(new { message = "Bu şablon daha önce mail gönderiminde kullanıldığı için silinemez." });
            }

            db.Templates.Remove(template);
            db.SaveChanges();
            LogManager.LogAction(userId, "Şablon Silindi", $"'{template.Title}' adlı şablon sistemden silindi.");
            return Ok(new { message = "Başarıyla silindi." });
        }
    }

    // 4. Şablon güncelle
    [HttpPut("{id}")]
    public IActionResult UpdateTemplate(int id, [FromBody] Template model)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var template = db.Templates.FirstOrDefault(t => t.Id == id && t.UserId == userId);
            if (template == null) return NotFound();

            if (string.IsNullOrEmpty(model.Title)) return BadRequest(new { message = "Başlık boş olamaz." });

            template.Title = model.Title;
            template.Content = model.Content;
            template.IsActive = model.IsActive;
            
            db.SaveChanges();
            LogManager.LogAction(userId, "Şablon Güncellendi", $"'{template.Title}' adlı şablonun içeriği/başlığı güncellendi.");
            return Ok(template);
        }
    }

    // 5. Toplu Şablon Silme
    [HttpPost("bulk-delete")]
    public IActionResult BulkDelete([FromBody] List<int> ids)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var templates = db.Templates.Where(t => ids.Contains(t.Id) && t.UserId == userId).ToList();
            var deletedCount = 0;
            var skippedCount = 0;

            foreach (var t in templates)
            {
                var isUsed = db.MailLogs.Any(log => log.TemplateId == t.Id);
                if (isUsed) { skippedCount++; continue; }

                db.Templates.Remove(t);
                deletedCount++;
            }

            db.SaveChanges();
            if (deletedCount > 0) LogManager.LogAction(userId, "Toplu Şablon Silme", $"{deletedCount} adet şablon toplu olarak silindi.");
            return Ok(new { message = $"{deletedCount} şablon silindi. {skippedCount} şablon kullanımda olduğu için atlandı.", deletedCount, skippedCount });
        }
    }

    // 6. Toplu Durum Güncelleme (Aktif/Pasif)
    [HttpPost("bulk-status")]
    public IActionResult BulkStatus([FromBody] BulkStatusRequest request)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var templates = db.Templates.Where(t => request.Ids.Contains(t.Id) && t.UserId == userId).ToList();
            foreach (var t in templates)
            {
                t.IsActive = request.Status;
            }
            db.SaveChanges();
            LogManager.LogAction(userId, "Toplu Şablon Durumu Güncelleme", $"{templates.Count} adet şablonun durumu toplu olarak {(request.Status ? "Aktif" : "Pasif")} yapıldı.");
            return Ok(new { message = $"{templates.Count} şablon durumu güncellendi." });
        }
    }

    // 7. Word Dosyasından Şablon Yükleme (Mobile Import)
    [HttpPost("import-word")]
    public IActionResult ImportWord(IFormFile file)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        if (file == null || file.Length == 0)
        {
            return BadRequest(new { message = "Lütfen geçerli bir Word dosyası yükleyin." });
        }

        try
        {
            using (var stream = file.OpenReadStream())
            {
                var converter = new Mammoth.DocumentConverter();
                var result = converter.ConvertToHtml(stream);
                
                var title = System.IO.Path.GetFileNameWithoutExtension(file.FileName);

                var template = new Template
                {
                    UserId = userId,
                    Title = title,
                    Content = result.Value,
                    CreatedDate = DateTime.Now,
                    IsActive = true
                };

                using (var db = new MailMarketingContext())
                {
                    db.Templates.Add(template);
                    db.SaveChanges();
                    
                    LogManager.LogAction(userId, "Word'den Şablon Aktarımı", $"Word belgesi üzerinden '{title}' adlı yeni şablon oluşturuldu.");
                    return Ok(new { message = $"Word belgesi başarıyla HTML'e çevrilip şablon olarak eklendi: '{title}'.", templateId = template.Id });
                }
            }
        }
        catch (System.Exception ex)
        {
            return BadRequest(new { message = "Word dönüştürme hatası: " + ex.Message });
        }
    }
}