using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using System.Linq;
using System.Security.Claims;
using MailMarketing.API.Models;
using OfficeOpenXml;
using System.IO;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using MailMarketing.Business;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class SubscribersController : ControllerBase
{
    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(userIdClaim, out var userId) ? userId : 0;
    }

    [HttpGet("all")]
    public IActionResult GetAllSubscribers()
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var subscribers = db.Subscribers
                                .Where(s => s.UserId == userId)
                                .OrderByDescending(s => s.CreatedDate)
                                .ToList();
            return Ok(subscribers);
        }
    }

    [HttpGet("folders")]
    public IActionResult GetFolders()
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            var groups = db.SubscriberGroups
                           .Where(g => g.UserId == userId)
                           .ToList();
            // Toplam abone sayısı (sistem klasörü için, aktif/pasif tümü)
            var totalCount = db.Subscribers.Count(s => s.UserId == userId);

            var result = groups.Select(g => new
            {
                g.Id,
                g.GroupName,
                g.IsSystem,
                g.UserId,
                g.CreatedAt,
                // Sistem klasörü ise tüm aboneleri say, değilse join tablosundan say
                subscriberCount = g.IsSystem
                    ? totalCount
                    : db.SubscriberGroupMembers.Count(m => m.GroupId == g.Id)
            }).ToList();

            return Ok(result);
        }
    }

    [HttpGet("folders/{id}")]
    public IActionResult GetFolder(int id)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            var folder = db.SubscriberGroups.FirstOrDefault(g => g.Id == id && g.UserId == userId);
            if (folder == null) return NotFound(new { message = "Klasör bulunamadı!" });

            return Ok(folder);
        }
    }

    [HttpGet("group/{groupId}")]
    public IActionResult GetSubscribersByGroup(int groupId)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == userId);
            if (group == null) return NotFound(new { message = "Grup bulunamadı!" });

            if (group.IsSystem)
            {
                // Sistem klasörü ise tüm aboneleri dön
                var allSubscribers = db.Subscribers
                                    .Where(s => s.UserId == userId)
                                    .OrderByDescending(s => s.CreatedDate)
                                    .ToList();
                return Ok(allSubscribers);
            }

            var subscribers = db.SubscriberGroupMembers
                                .Where(m => m.GroupId == groupId)
                                .Select(m => m.Subscriber)
                                .ToList();

            return Ok(subscribers);
        }
    }

    [HttpPost("add/{groupId}")]
    public IActionResult AddSubscriber(int groupId, [FromBody] Subscriber subscriber)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        subscriber.UserId = userId;

        using (var db = new MailMarketingContext())
        {
            if (!IsValidEmail(subscriber.Email)) return BadRequest(new { message = "Geçersiz e-posta adresi formatı!" });

            var exists = db.Subscribers.Any(s => s.UserId == userId && s.Email == subscriber.Email);
            if (exists) return BadRequest(new { message = "Bu e-posta adresine sahip bir abone zaten mevcut!" });

            using (var transaction = db.Database.BeginTransaction())
            {
                try 
                {
                    db.Subscribers.Add(subscriber);
                    db.SaveChanges(); 

                    var groupMember = new SubscriberGroupMember
                    {
                        SubscriberId = subscriber.Id,
                        GroupId = groupId
                    };
                    
                    db.SubscriberGroupMembers.Add(groupMember);
                    db.SaveChanges();

                    transaction.Commit(); 
                    
                    LogManager.LogAction(userId, "Yeni Abone Eklendi", $"'{subscriber.Email}' adlı abone sisteme eklendi ve gruba dahil edildi.");
                    return Ok(new { message = "Abone başarıyla eklendi ve gruba bağlandı!", id = subscriber.Id });
                }
                catch (System.Exception ex)
                {
                    transaction.Rollback(); 
                    return BadRequest(new { message = "Ekleme sırasında bir hata oluştu: " + ex.Message });
                }
            }
        }
    }

    [HttpDelete("delete/{id}")]
    public IActionResult DeleteSubscriber(int id)
    {
        using (var db = new MailMarketingContext())
        {
            try
            {
                var subscriber = db.Subscribers.Find(id);
                if (subscriber == null) return NotFound(new { message = "Abone bulunamadı!" });

                // Mail gönderim geçmişi kontrolü
                bool hasMailLogs = db.MailLogs.Any(m => m.SubscriberId == id);
                if (hasMailLogs)
                {
                    return BadRequest(new { message = "Bu aboneye daha önce mail gönderimi yapıldığı için silinemez. Bunun yerine aboneyi pasife alabilirsiniz." });
                }

                // Grup bağlantılarını sil
                var memberships = db.SubscriberGroupMembers.Where(m => m.SubscriberId == id).ToList();
                if (memberships.Any())
                    db.SubscriberGroupMembers.RemoveRange(memberships);

                db.Subscribers.Remove(subscriber);
                db.SaveChanges();

                LogManager.LogAction(GetCurrentUserId(), "Abone Silindi", $"{subscriber.Email} e-posta adresli abone silindi.");
                return Ok(new { message = "Abone başarıyla silindi!" });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Silme işlemi sırasında bir hata oluştu: " + ex.Message });
            }
        }
    }

    [HttpPut("update/{id}")]
    public IActionResult UpdateSubscriber(int id, [FromBody] Subscriber model)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var subscriber = db.Subscribers.FirstOrDefault(s => s.Id == id && s.UserId == userId);
            if (subscriber == null) return NotFound();

            if (!IsValidEmail(model.Email)) return BadRequest(new { message = "Geçersiz e-posta adresi formatı!" });

            var exists = db.Subscribers.Any(s => s.UserId == userId && s.Email == model.Email && s.Id != id);
            if (exists) return BadRequest(new { message = "Bu e-posta adresine sahip başka bir abone zaten mevcut!" });

            subscriber.FirstName = model.FirstName;
            subscriber.LastName = model.LastName;
            subscriber.Email = model.Email;
            
            db.SaveChanges();
            LogManager.LogAction(userId, "Abone Güncellendi", $"'{subscriber.Email}' adlı abonenin bilgileri güncellendi.");
            return Ok(subscriber);
        }
    }

    [HttpPost("toggle-status/{id}")]
    public IActionResult ToggleSubscriberStatus(int id)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            var subscriber = db.Subscribers.FirstOrDefault(s => s.Id == id && s.UserId == userId);
            if (subscriber == null) return NotFound();

            subscriber.IsActive = !subscriber.IsActive;
            db.SaveChanges();
            LogManager.LogAction(userId, "Abone Durumu Güncellendi", $"'{subscriber.Email}' adlı abonenin durumu {(subscriber.IsActive ? "Aktif" : "Pasif")} olarak değiştirildi.");
            return Ok(new { isActive = subscriber.IsActive });
        }
    }

    [HttpGet("stats")]
    public IActionResult GetStats()
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            try
            {
                var totalSubscribers = db.Subscribers.Where(s => s.UserId == userId && s.IsActive == true).Count();
                var totalGroups = db.SubscriberGroups.Count(g => g.UserId == userId);
                var readyTemplates = db.Templates.Count(t => t.UserId == userId && t.IsActive);
                
                var userLogs = db.MailLogs.Where(l => l.Template != null && l.Template.UserId == userId);
                var totalSent = userLogs.Count();

                var recentActivities = userLogs
                                        .OrderByDescending(l => l.SentDate)
                                        .Take(5)
                                        .Select(l => new {
                                            l.Id,
                                            Subject = l.Template != null ? l.Template.Title : "Bilinmiyor",
                                            Date = l.SentDate,
                                            IsSuccess = l.IsSuccess
                                        })
                                        .ToList();

                var last7Days = DateTime.Now.Date.AddDays(-6);
                var weeklyCounts = userLogs
                                    .Where(l => l.SentDate >= last7Days)
                                    .GroupBy(l => l.SentDate.Date)
                                    .Select(g => new { Date = g.Key, Count = g.Count() })
                                    .ToList();

                var culture = new System.Globalization.CultureInfo("tr-TR");
                var weeklyAnalysis = Enumerable.Range(0, 7).Select(i => {
                    var date = last7Days.AddDays(i);
                    var count = weeklyCounts.FirstOrDefault(c => c.Date == date)?.Count ?? 0;
                    return new { day = date.ToString("ddd", culture), count };
                }).ToList();

                return Ok(new
                {
                    activeSubscribers = totalSubscribers,
                    totalGroups,
                    readyTemplates,
                    totalSent,
                    recentActivities,
                    weeklyAnalysis
                });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "İstatistikler alınamadı: " + ex.Message });
            }
        }
    }

    [HttpPost("create-folder")]
    public IActionResult CreateFolder([FromBody] SubscriberGroup group)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        group.UserId = userId;
        group.CreatedAt = DateTime.Now;

        using (var db = new MailMarketingContext())
        {
            try
            {
                var exists = db.SubscriberGroups.Any(g => g.UserId == userId && g.GroupName == group.GroupName);
                if (exists) return BadRequest(new { message = "Bu isimde bir klasör zaten mevcut!" });

                db.SubscriberGroups.Add(group);
                db.SaveChanges();
                LogManager.LogAction(userId, "Yeni Klasör Oluşturuldu", $"'{group.GroupName}' adlı yeni abone klasörü oluşturuldu.");
                return Ok(new { message = "Klasör başarıyla oluşturuldu!", id = group.Id });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Klasör oluşturulurken hata: " + ex.Message });
            }
        }
    }

    [HttpDelete("delete-folder/{id}")]
    public IActionResult DeleteFolder(int id)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            try
            {
                var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == id && g.UserId == userId);
                if (group == null) return NotFound(new { message = "Klasör bulunamadı!" });

                if (group.IsSystem) return BadRequest(new { message = "Sistem klasörleri silinemez!" });

                var members = db.SubscriberGroupMembers.Where(m => m.GroupId == id).ToList();
                db.SubscriberGroupMembers.RemoveRange(members);

                db.SubscriberGroups.Remove(group);
                db.SaveChanges();

                LogManager.LogAction(userId, "Klasör Silindi", $"'{group.GroupName}' adlı klasör ve içindeki tüm bağlantılar silindi.");
                return Ok(new { message = "Klasör başarıyla silindi!" });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Klasör silinirken hata: " + ex.Message });
            }
        }
    }

    [HttpPut("rename-folder/{id}")]
    public IActionResult RenameFolder(int id, [FromBody] string newName)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        if (string.IsNullOrWhiteSpace(newName)) return BadRequest(new { message = "Geçerli bir ad girin!" });

        using (var db = new MailMarketingContext())
        {
            try
            {
                var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == id && g.UserId == userId);
                if (group == null) return NotFound(new { message = "Klasör bulunamadı!" });

                if (group.IsSystem) return BadRequest(new { message = "Sistem klasörleri yeniden adlandırılamaz!" });

                var exists = db.SubscriberGroups.Any(g => g.UserId == userId && g.GroupName == newName && g.Id != id);
                if (exists) return BadRequest(new { message = "Bu isimde başka bir klasör zaten mevcut!" });

                group.GroupName = newName;
                db.SaveChanges();

                LogManager.LogAction(userId, "Klasör Adı Değiştirildi", $"Klasörün yeni adı '{newName}' olarak güncellendi.");
                return Ok(new { message = "Klasör adı güncellendi!" });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Ad güncellenirken hata: " + ex.Message });
            }
        }
    }

    [HttpPost("add-members/{groupId}")]
    public IActionResult AddMembersToGroup(int groupId, [FromBody] List<int> subscriberIds)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        if (subscriberIds == null || !subscriberIds.Any()) 
            return BadRequest(new { message = "Eklenecek abone seçilmedi!" });

        using (var db = new MailMarketingContext())
        {
            var addedCount = 0;
            var skippedCount = 0;

            foreach (var subId in subscriberIds)
            {
                var subscriberExists = db.Subscribers.Any(s => s.Id == subId && s.UserId == userId);
                if (!subscriberExists) { skippedCount++; continue; }

                var alreadyMember = db.SubscriberGroupMembers.Any(m => m.GroupId == groupId && m.SubscriberId == subId);
                if (alreadyMember) { skippedCount++; continue; }

                db.SubscriberGroupMembers.Add(new SubscriberGroupMember
                {
                    GroupId = groupId,
                    SubscriberId = subId
                });
                addedCount++;
            }

            if (addedCount > 0) db.SaveChanges();

            if (addedCount > 0) 
            {
                var groupName = db.SubscriberGroups.Find(groupId)?.GroupName ?? $"Grup ID: {groupId}";
                LogManager.LogAction(userId, "Klasöre Aboneler Eklendi", $"'{groupName}' klasörüne {addedCount} yeni abone dahil edildi.");
            }
            return Ok(new { message = $"{addedCount} abone başarıyla eklendi.", addedCount, skippedCount });
        }
    }

    [HttpPost("remove-members/{groupId}")]
    public IActionResult RemoveMembersFromGroup(int groupId, [FromBody] List<int> subscriberIds)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        if (subscriberIds == null || !subscriberIds.Any()) 
            return BadRequest(new { message = "Çıkarılacak abone seçilmedi!" });

        using (var db = new MailMarketingContext())
        {
            try 
            {
                var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == userId);
                if (group == null) return NotFound(new { message = "Klasör bulunamadı!" });
                if (group.IsSystem) return BadRequest(new { message = "Sistem klasöründen abone çıkarılamaz!" });

                var membersToRemove = db.SubscriberGroupMembers
                                        .Where(m => m.GroupId == groupId && subscriberIds.Contains(m.SubscriberId))
                                        .ToList();

                if (membersToRemove.Any())
                {
                    db.SubscriberGroupMembers.RemoveRange(membersToRemove);
                    db.SaveChanges();
                }

                if (membersToRemove.Any()) 
                {
                    var groupName = db.SubscriberGroups.Find(groupId)?.GroupName ?? $"Grup ID: {groupId}";
                    LogManager.LogAction(userId, "Klasörden Aboneler Çıkarıldı", $"'{groupName}' klasöründen {membersToRemove.Count} abone çıkarıldı.");
                }
                return Ok(new { message = $"{membersToRemove.Count} abone klasörden çıkarıldı." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "İşlem hatası: " + ex.Message });
            }
        }
    }

    [HttpPost("bulk-delete")]
    public IActionResult BulkDelete([FromBody] List<int> ids)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            try 
            {
                var subscribers = db.Subscribers.Where(s => ids.Contains(s.Id) && s.UserId == userId).ToList();
                if (!subscribers.Any()) return Ok(new { message = "Abone bulunamadı." });

                int skipped = 0;
                int deleted = 0;

                foreach (var sub in subscribers)
                {
                    // Mail gönderim geçmişi kontrolü (Audit/Veri bütünlüğü için)
                    if (db.MailLogs.Any(m => m.SubscriberId == sub.Id))
                    {
                        skipped++;
                        continue;
                    }

                    var memberships = db.SubscriberGroupMembers.Where(m => m.SubscriberId == sub.Id).ToList();
                    if (memberships.Any()) db.SubscriberGroupMembers.RemoveRange(memberships);

                    db.Subscribers.Remove(sub);
                    deleted++;
                }

                db.SaveChanges();

                LogManager.LogAction(userId, "Toplu Abone Silme", $"{deleted} adet abone toplu olarak silindi. ({skipped} adet mail kaydı olduğu için atlandı)");

                if (skipped > 0)
                    return Ok(new { message = $"{deleted} kişi silindi, {skipped} kişi gönderim kaydı olduğu için atlandı!" });
                return Ok(new { message = $"{deleted} abone başarıyla silindi." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Hata: " + ex.Message });
            }
        }
    }

    [HttpPost("bulk-status")]
    public IActionResult BulkStatus([FromBody] BulkStatusRequest request)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            try 
            {
                var subscribers = db.Subscribers.Where(s => request.Ids.Contains(s.Id) && s.UserId == userId).ToList();
                foreach (var s in subscribers) s.IsActive = request.Status;
                db.SaveChanges();
                LogManager.LogAction(userId, "Toplu Durum Güncelleme", $"{subscribers.Count} adet abonenin durumu toplu olarak {(request.Status ? "Aktif" : "Pasif")} yapıldı.");
                return Ok(new { message = $"{subscribers.Count} abone güncellendi." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Hata: " + ex.Message });
            }
        }
    }

    [HttpPost("bulk-delete-folders")]
    public IActionResult BulkDeleteFolders([FromBody] List<int> ids)
    {
        var userId = GetCurrentUserId();
        using (var db = new MailMarketingContext())
        {
            try 
            {
                var groups = db.SubscriberGroups.Where(g => ids.Contains(g.Id) && g.UserId == userId && !g.IsSystem).ToList();
                if (!groups.Any()) return Ok(new { message = "Klasör bulunamadı." });

                var groupIds = groups.Select(g => g.Id).ToList();
                var members = db.SubscriberGroupMembers.Where(m => groupIds.Contains(m.GroupId)).ToList();
                if (members.Any()) db.SubscriberGroupMembers.RemoveRange(members);

                db.SubscriberGroups.RemoveRange(groups);
                db.SaveChanges();

                LogManager.LogAction(userId, "Toplu Klasör Silme", $"{groups.Count} adet klasör toplu olarak silindi.");
                return Ok(new { message = $"{groups.Count} klasör silindi." });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Hata: " + ex.Message });
            }
        }
    }

    [HttpPost("import")]
    public async Task<IActionResult> Import(IFormFile file)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        if (file == null || file.Length == 0) 
            return BadRequest(new { message = "Lütfen geçerli bir dosya yükleyin." });

        try
        {
            System.Text.Encoding.RegisterProvider(System.Text.CodePagesEncodingProvider.Instance);
            int addedCount = 0;
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;

            using (var stream = new MemoryStream()) 
            {
                await file.CopyToAsync(stream);
                using (var package = new ExcelPackage(stream)) 
                {
                    var worksheet = package.Workbook.Worksheets.FirstOrDefault();
                    if (worksheet == null) return BadRequest(new { message = "Excel sayfa yapısı geçerli değil." });

                    using (var db = new MailMarketingContext()) 
                    {
                        var systemGroup = db.SubscriberGroups.FirstOrDefault(g => g.UserId == userId && g.IsSystem);

                        // Başlık satırını oku ve sütun pozisyonlarını belirle
                        int colCount = worksheet.Dimension.Columns;
                        int emailCol = -1, firstNameCol = -1, lastNameCol = -1;

                        for (int col = 1; col <= colCount; col++)
                        {
                            var header = (worksheet.Cells[1, col].Text ?? "").Trim().ToLowerInvariant();
                            if (header == "email" || header == "e-mail" || header == "e-posta" || header == "eposta" || header == "mail" || header == "posta")
                                emailCol = col;
                            else if (header == "ad" || header == "adı" || header == "isim" || header == "i̇sim" || header == "first name" || header == "firstname" || header == "fname" || header == "name")
                                firstNameCol = col;
                            else if (header == "soyad" || header == "soyadı" || header == "last name" || header == "lastname" || header == "lname" || header == "surname")
                                lastNameCol = col;
                        }

                        // Hiç başlık yoksa (sadece veri dosyası) varsayılan sırayı kullan: 1=email, 2=ad, 3=soyad
                        if (emailCol == -1) emailCol = 1;
                        if (firstNameCol == -1) firstNameCol = 2;
                        if (lastNameCol == -1) lastNameCol = 3;

                        // Başlık satırı varsa 2'den, yoksa 1'den başla
                        bool hasHeader = worksheet.Cells[1, emailCol].Text?.Contains("@") == false;
                        int startRow = hasHeader ? 2 : 1;

                        for (int row = startRow; row <= worksheet.Dimension.Rows; row++) 
                        {
                            var email = worksheet.Cells[row, emailCol].Text?.Trim();
                            if (string.IsNullOrEmpty(email) || !IsValidEmail(email) || db.Subscribers.Any(s => s.Email == email && s.UserId == userId)) continue;
                            
                            var newSub = new Subscriber { 
                                Email = email, 
                                FirstName = firstNameCol <= colCount ? worksheet.Cells[row, firstNameCol].Text : "",
                                LastName = lastNameCol <= colCount ? worksheet.Cells[row, lastNameCol].Text : "",
                                CreatedDate = DateTime.Now, 
                                IsActive = true, 
                                UserId = userId 
                            };
                            
                            db.Subscribers.Add(newSub);
                            db.SaveChanges();

                            if (systemGroup != null)
                            {
                                db.SubscriberGroupMembers.Add(new SubscriberGroupMember { 
                                    GroupId = systemGroup.Id, 
                                    SubscriberId = newSub.Id 
                                });
                                db.SaveChanges();
                            }

                            addedCount++;
                        }
                        
                        if (addedCount == 0)
                        {
                            return BadRequest(new { message = "Excel dosyasının içerisinde yeni abone bulunamadı." });
                        }

                        LogManager.LogAction(userId, "Excel'den Abone Aktarımı", $"Excel dosyası üzerinden {addedCount} yeni abone sisteme aktarıldı.");
                        return Ok(new { message = $"Excel aktarımı tamamlandı. {addedCount} yeni abone eklendi.", addedCount });
                    }
                }
            }
        }
        catch (System.Exception ex)
        {
            Console.WriteLine($"[EXCEL İÇE AKTARMA HATASI]: {ex}");
            var errorMsg = ex.InnerException != null ? ex.InnerException.Message : ex.Message;
            return BadRequest(new { message = "Excel işlenirken bir hata oluştu: " + errorMsg });
        }
    }

    private static bool IsValidEmail(string? email)
    {
        if (string.IsNullOrWhiteSpace(email)) return false;
        try
        {
            var addr = new System.Net.Mail.MailAddress(email.Trim());
            return addr.Address == email.Trim();
        }
        catch
        {
            return false;
        }
    }
}
