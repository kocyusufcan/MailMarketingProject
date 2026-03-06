using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using System.Linq;
using System.Security.Claims;
using System.Text;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class ReportsController : ControllerBase
{
    private int GetCurrentUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

    [HttpGet("history")]
    public IActionResult GetCampaignHistory([FromQuery] string? search, [FromQuery] string? status, [FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate, [FromQuery] int? targetUserId)
    {
        var currentUserId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            if (currentUser == null) return Unauthorized();

            int userIdToFilter = currentUserId;

            // Eğer targetUserId gönderilmişse ve kullanıcı Admin ise yetki kontrolü yap
            if (targetUserId.HasValue && targetUserId.Value != currentUserId)
            {
                if (!currentUser.IsAdmin) return Forbid();

                var targetUser = db.Users.Find(targetUserId.Value);
                if (targetUser == null) return NotFound("Hedef kullanıcı bulunamadı.");

                // Yetki Kontrolü: Aynı ekipte mi?
                int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
                int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

                if (myRoot != targetRoot) return Forbid();

                // Sub-admin ise başka bir adminin raporlarını göremez (Sadece root görebilir)
                if (targetUser.IsAdmin && currentUser.ParentAdminId != null && targetUser.Id != currentUser.Id)
                    return Forbid();

                userIdToFilter = targetUserId.Value;
            }

            var query = db.MailLogs
                .Where(l =>
                    // Şablonu hâlâ mevcut olan loglar
                    (l.Template != null && l.Template.UserId == userIdToFilter) ||
                    // Şablonu silinmiş veya hiç olmayan loglar - aboneye bakarak kontrol et
                    (l.Template == null && l.Subscriber != null && l.Subscriber.UserId == userIdToFilter) ||
                    // TemplateId var ama Template entitiy yüklenememiş olabilir - doğrudan abone sahibini kontrol et
                    (l.TemplateId != null && l.Subscriber != null && l.Subscriber.UserId == userIdToFilter));

            if (!string.IsNullOrEmpty(search))
            {
                query = query.Where(l => (l.Template != null && l.Template.Title != null && l.Template.Title.Contains(search)) || 
                                         (l.Subscriber != null && l.Subscriber.Email != null && l.Subscriber.Email.Contains(search)));
            }

            if (!string.IsNullOrEmpty(status))
            {
                if (status == "Success") query = query.Where(l => l.IsSuccess);
                else if (status == "Error") query = query.Where(l => !l.IsSuccess);
            }

            if (startDate.HasValue) query = query.Where(l => l.SentDate >= startDate.Value);
            if (endDate.HasValue) query = query.Where(l => l.SentDate <= endDate.Value);

            var history = query
                            .OrderByDescending(l => l.SentDate)
                            .Select(l => new {
                                l.Id,
                                Subject = (l.Template != null ? l.Template.Title : "Konu Yok"),
                                ReceiverEmail = (l.Subscriber != null ? l.Subscriber.Email : "Bilinmiyor"),
                                SentDate = l.SentDate,
                                Status = l.IsSuccess ? "Success" : "Error",
                                ErrorMessage = l.ErrorMessage
                            })
                            .Take(200)
                            .ToList();

            return Ok(history);
        }
    }

    [HttpPost("bulk-delete")]
    public IActionResult BulkDelete([FromBody] System.Collections.Generic.List<int> ids)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            // Template içerenleri sil (normal gönderimler)
            var logsWithTemplate = db.MailLogs.Where(l => ids.Contains(l.Id) && l.Template != null && l.Template.UserId == userId).ToList();
            // Template içermeyenleri sil (bounce kayıtları vs.) - abonenin sahibi kontrol edilerek
            var logsWithoutTemplate = db.MailLogs.Where(l => ids.Contains(l.Id) && l.TemplateId == null && l.Subscriber != null && l.Subscriber.UserId == userId).ToList();

            var allLogs = logsWithTemplate.Concat(logsWithoutTemplate).ToList();
            db.MailLogs.RemoveRange(allLogs);
            db.SaveChanges();
            return Ok(new { message = $"{allLogs.Count} rapor silindi." });
        }
    }

    [HttpGet("export-csv")]
    public IActionResult ExportCsv([FromQuery] string? search, [FromQuery] string? status, [FromQuery] DateTime? startDate, [FromQuery] DateTime? endDate, [FromQuery] int? targetUserId)
    {
        var currentUserId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var currentUser = db.Users.Find(currentUserId);
            if (currentUser == null) return Unauthorized();

            int userIdToFilter = currentUserId;

            // Yetki kontrolü
            if (targetUserId.HasValue && targetUserId.Value != currentUserId)
            {
                if (!currentUser.IsAdmin) return Forbid();

                var targetUser = db.Users.Find(targetUserId.Value);
                if (targetUser == null) return NotFound("Hedef kullanıcı bulunamadı.");

                int myRoot = currentUser.ParentAdminId ?? currentUser.Id;
                int targetRoot = targetUser.ParentAdminId ?? targetUser.Id;

                if (myRoot != targetRoot) return Forbid();

                if (targetUser.IsAdmin && currentUser.ParentAdminId != null && targetUser.Id != currentUser.Id)
                    return Forbid();

                userIdToFilter = targetUserId.Value;
            }

            var query = db.MailLogs
                .Where(l => l.Template != null && l.Template.UserId == userIdToFilter)
                .AsQueryable();

            if (!string.IsNullOrEmpty(search))
                query = query.Where(l => (l.Template != null && l.Template.Title != null && l.Template.Title.Contains(search)) ||
                                         (l.Subscriber != null && l.Subscriber.Email != null && l.Subscriber.Email.Contains(search)));

            if (!string.IsNullOrEmpty(status))
            {
                if (status == "Success") query = query.Where(l => l.IsSuccess);
                else if (status == "Error") query = query.Where(l => !l.IsSuccess);
            }

            if (startDate.HasValue) query = query.Where(l => l.SentDate >= startDate.Value);
            if (endDate.HasValue) query = query.Where(l => l.SentDate <= endDate.Value);

            var data = query
                .OrderByDescending(l => l.SentDate)
                .Select(l => new
                {
                    Email = l.Subscriber != null ? l.Subscriber.Email : "Bilinmiyor",
                    Subject = l.Template != null ? l.Template.Title : "Konu Yok",
                    SentDate = l.SentDate,
                    Status = l.IsSuccess ? "Başarılı" : "Hata",
                    ErrorMessage = l.ErrorMessage ?? "İletildi"
                })
                .ToList();

            // UTF-8 BOM ile CSV oluştur (Excel Türkçe karakterleri doğru okusun diye)
            var sb = new StringBuilder();
            sb.AppendLine("Alıcı E-Posta,Konu,Gönderim Tarihi,Durum,Açıklama");
            foreach (var item in data)
            {
                var date = item.SentDate.ToString("dd.MM.yyyy HH:mm");
                // CSV injection ve virgül içeren alanlar için tırnak içine al
                sb.AppendLine($"\"{item.Email}\",\"{item.Subject}\",\"{date}\",\"{item.Status}\",\"{item.ErrorMessage}\"");
            }

            var bom = Encoding.UTF8.GetPreamble();
            var csvBytes = Encoding.UTF8.GetBytes(sb.ToString());
            var fileBytes = new byte[bom.Length + csvBytes.Length];
            Buffer.BlockCopy(bom, 0, fileBytes, 0, bom.Length);
            Buffer.BlockCopy(csvBytes, 0, fileBytes, bom.Length, csvBytes.Length);

            var fileName = $"Rapor_{DateTime.Now:ddMMyyyy_HHmm}.csv";
            return File(fileBytes, "text/csv; charset=utf-8", fileName);
        }
    }

    // Aktivite Loglarını Getir
    [HttpGet("activity")]
    public IActionResult GetActivity()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var logs = db.ActivityLogs
                         .Where(l => l.UserId == userId)
                         .OrderByDescending(l => l.CreatedAt)
                         .Take(30)
                         .ToList();
            return Ok(logs);
        }
    }

    // Grafik Verisi (Haftalık Analiz)
    [HttpGet("chart-data")]
    public IActionResult GetChartData()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            // Son 7 günün tarihlerini belirle
            var startDate = DateTime.Today.AddDays(-6);
            
            var logs = db.MailLogs
                         .Where(l => l.Template != null && l.Template.UserId == userId && l.SentDate >= startDate)
                         .ToList();

            var chartData = new List<object>();
            for (int i = 0; i < 7; i++)
            {
                var date = startDate.AddDays(i);
                var count = logs.Count(l => l.SentDate.Date == date.Date);
                chartData.Add(new { 
                    Day = date.ToString("dd MMM"), 
                    Count = count 
                });
            }

            return Ok(chartData);
        }
    }
}