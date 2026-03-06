using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.API.Services;
using MailMarketing.Business; // SecurityHelper için eklendi
using MailMarketing.Entity;
using System.Linq;
using System.Security.Claims;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class CampaignController : ControllerBase
{
    private readonly EmailService _emailService = new EmailService();

    private int GetCurrentUserId()
    {
        var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(userIdClaim, out var userId) ? userId : 0;
    }

    [HttpPost("send-to-group/{groupId}")]
    public IActionResult SendToGroup(int groupId, [FromBody] CampaignRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            // Orijinal 'Settings' tablosunu çekiyoruz
            var smtp = db.Settings.FirstOrDefault(s => s.UserId == userId);

            if (smtp == null)
                return BadRequest(new { message = "Lütfen önce 'SMTP Ayarlarım' kısmından bilgilerinizi kaydedin!" });

            // KRİTİK: Mail göndermeden önce şifireyi çözmemiz gerekiyor
            if (!string.IsNullOrEmpty(smtp.Password))
            {
                smtp.Password = SecurityHelper.Decrypt(smtp.Password);
            }

            // E-posta adresi format doğrulaması
            if (!IsValidEmail(smtp.Email))
                return BadRequest(new { message = $"SMTP E-posta adresiniz geçersiz görünüyor: '{smtp.Email}'. Lütfen SMTP Ayarlarım bölümünden düzeltin (Örn: ornek@gmail.com)." });

            var group = db.SubscriberGroups.FirstOrDefault(g => g.Id == groupId && g.UserId == userId);
            if (group == null)
                return BadRequest(new { message = "Klasör bulunamadı!" });

            List<Subscriber?> subscribers;

            if (group.IsSystem)
            {
                // Sistem klasörü (Tüm Aboneler) ise SubscriberGroupMembers yerine
                // doğrudan tüm aktif aboneleri çek — bu, görüntüleme ile tutarlı
                subscribers = db.Subscribers
                    .Where(s => s.UserId == userId && s.IsActive == true)
                    .Cast<Subscriber?>()
                    .ToList();
            }
            else
            {
                subscribers = db.SubscriberGroupMembers
                    .Where(m => m.GroupId == groupId)
                    .Select(m => m.Subscriber)
                    .Where(s => s != null && s.IsActive == true)
                    .Distinct()
                    .ToList();
            }

            if (subscribers == null || !subscribers.Any())
                return BadRequest(new { message = "Bu grupta gönderim yapılabilecek aktif abone yok!" });

            var clonedSmtp = new Setting 
            {
                Email = smtp.Email,
                Password = smtp.Password,
                MailServer = smtp.MailServer,
                Port = smtp.Port,
                EnableSSL = smtp.EnableSSL
            };

            var subscriberList = subscribers.Select(s => new { s!.Id, s.Email, s.FirstName }).ToList();
            int totalCount = subscriberList.Count;
            string body = request.Body ?? "";
            string subject = request.Subject ?? "Bilgilendirme";
            int? templateId = request.TemplateId > 0 ? request.TemplateId : (int?)null;

            _ = Task.Run(async () =>
            {
                using (var bgDb = new MailMarketingContext())
                {
                    var emailService = new EmailService();

                    foreach (var sub in subscriberList)
                    {
                        if (string.IsNullOrEmpty(sub.Email)) continue;

                        string firstName = sub.FirstName ?? "Değerli Abonemiz";
                        string personalizedBody = body.Replace("[AD]", firstName);
                        
                        var log = new MailLog { 
                            SubscriberId = sub.Id, 
                            TemplateId = templateId,
                            SentDate = DateTime.Now 
                        };

                        try 
                        {
                            var result = await emailService.SendEmailAsync(sub.Email, subject, personalizedBody, clonedSmtp);
                            if (result) 
                            {
                                log.IsSuccess = true;
                                log.ErrorMessage = "İletildi";
                            }
                            else
                            {
                                log.IsSuccess = false;
                                log.ErrorMessage = "SMTP Hatası (Detay için terminale bakın)";

                                // SMTP false döndürdüğünde de aboneyi pasife al
                                var subToDeactivate = bgDb.Subscribers.Find(sub.Id);
                                if (subToDeactivate != null)
                                {
                                    subToDeactivate.IsActive = false;
                                    bgDb.Notifications.Add(new Notification
                                    {
                                        Title = "Gönderim Hatası (Pasife Alındı)",
                                        Message = $"{(subToDeactivate.FirstName ?? "")} {(subToDeactivate.LastName ?? "")} ({subToDeactivate.Email}) adresine gönderim başarısız oldu ve pasife alındı.",
                                        CreatedAt = DateTime.Now,
                                        IsRead = false,
                                        UserId = userId
                                    });
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            log.IsSuccess = false;
                            log.ErrorMessage = MailErrorHelper.GetFriendlyMessage(ex.Message);

                            // Hemen hata (format vs.) veriyorsa aboneyi direkt pasife al
                            var subToUpdate = bgDb.Subscribers.Find(sub.Id);
                            if (subToUpdate != null)
                            {
                                subToUpdate.IsActive = false;
                                bgDb.Notifications.Add(new Notification
                                {
                                    Title = "Gönderim Hatası (Pasife Alındı)",
                                    Message = $"{(subToUpdate.FirstName ?? "")} {(subToUpdate.LastName ?? "")} ({subToUpdate.Email}) adresine gönderim hemen başarısız oldu ve pasife alındı.",
                                    CreatedAt = DateTime.Now,
                                    IsRead = false,
                                    UserId = userId
                                });
                            }
                        }

                        bgDb.MailLogs.Add(log);
                    }

                    bgDb.SaveChanges();

                    var currentUser = bgDb.Users.Find(userId);
                    if (currentUser != null)
                    {
                        var bounceManager = new BounceCheckManager();
                        await bounceManager.CheckBouncesForUserAsync(currentUser);
                    }
                }
            });

            var groupName = group?.GroupName ?? $"Grup ID: {groupId}";
            LogManager.LogAction(userId, "Kampanya Başlatıldı", $"'{groupName}' klasöründeki {totalCount} kişiye mail gönderimi başlatıldı. Konu: {subject}");

            return Ok(new { message = $"{totalCount} kişiye gönderim arka planda başlatıldı. Raporlar ekranından takip edebilirsiniz." });
        }
    }
    [HttpPost("send-to-groups")]
    public IActionResult SendToGroups([FromBody] MultiGroupCampaignRequest request)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        if (request.GroupIds == null || !request.GroupIds.Any())
            return BadRequest(new { message = "Lütfen en az bir grup seçin!" });

        using (var db = new MailMarketingContext())
        {
            var smtp = db.Settings.FirstOrDefault(s => s.UserId == userId);
            if (smtp == null)
                return BadRequest(new { message = "Lütfen önce 'SMTP Ayarlarım' kısmından bilgilerinizi kaydedin!" });

            if (!string.IsNullOrEmpty(smtp.Password))
            {
                smtp.Password = SecurityHelper.Decrypt(smtp.Password);
            }

            // E-posta adresi format doğrulaması
            if (!IsValidEmail(smtp.Email))
                return BadRequest(new { message = $"SMTP E-posta adresiniz geçersiz görünüyor: '{smtp.Email}'. Lütfen SMTP Ayarlarım bölümünden düzeltin (Örn: ornek@gmail.com)." });

            // Seçilen gruplar arasında sistem klasörü var mı kontrol et
            var selectedGroups = db.SubscriberGroups
                                   .Where(g => request.GroupIds.Contains(g.Id) && g.UserId == userId)
                                   .ToList();

            bool hasSystemGroup = selectedGroups.Any(g => g.IsSystem);

            List<Subscriber> subscribers;

            if (hasSystemGroup)
            {
                // Eğer sistem klasörü (Tüm Aboneler) seçildiyse, kullanıcının tüm aktif abonelerine gönder
                subscribers = db.Subscribers
                                .Where(s => s.UserId == userId && s.IsActive == true)
                                .ToList();
            }
            else
            {
                // Sadece normal klasörler seçildiyse join tablosundan getir
                subscribers = db.SubscriberGroupMembers
                                .Where(m => request.GroupIds.Contains(m.GroupId))
                                .Select(m => m.Subscriber)
                                .Where(s => s != null && s.IsActive == true) // Sadece aktif aboneler
                                .Distinct()
                                .ToList()!;
            }

            if (subscribers == null || !subscribers.Any())
                return BadRequest(new { message = "Seçilen gruplarda gönderim yapılabilecek aktif abone yok!" });

            var clonedSmtp = new Setting 
            {
                Email = smtp.Email,
                Password = smtp.Password,
                MailServer = smtp.MailServer,
                Port = smtp.Port,
                EnableSSL = smtp.EnableSSL
            };

            var subscriberList = subscribers.Select(s => new { s!.Id, s.Email, s.FirstName }).ToList();
            int totalCount = subscriberList.Count;
            string body = request.Body ?? "";
            string subject = request.Subject ?? "Bilgilendirme";
            int? templateId = request.TemplateId > 0 ? request.TemplateId : (int?)null;

            _ = Task.Run(async () =>
            {
                using (var bgDb = new MailMarketingContext())
                {
                    var emailService = new EmailService();

                    foreach (var sub in subscriberList)
                    {
                        if (string.IsNullOrEmpty(sub.Email)) continue;

                        string firstName = sub.FirstName ?? "Değerli Abonemiz";
                        string personalizedBody = body.Replace("[AD]", firstName);
                        
                        var log = new MailLog { 
                            SubscriberId = sub.Id, 
                            TemplateId = templateId,
                            SentDate = DateTime.Now 
                        };

                        try 
                        {
                            var result = await emailService.SendEmailAsync(sub.Email, subject, personalizedBody, clonedSmtp);
                            if (result) 
                            {
                                log.IsSuccess = true;
                                log.ErrorMessage = "İletildi";
                            }
                            else
                            {
                                log.IsSuccess = false;
                                log.ErrorMessage = "SMTP Hatası";

                                // SMTP false döndürdüğünde de aboneyi pasife al
                                var subToDeactivate = bgDb.Subscribers.Find(sub.Id);
                                if (subToDeactivate != null)
                                {
                                    subToDeactivate.IsActive = false;
                                    bgDb.Notifications.Add(new Notification
                                    {
                                        Title = "Gönderim Hatası (Pasife Alındı)",
                                        Message = $"{(subToDeactivate.FirstName ?? "")} {(subToDeactivate.LastName ?? "")} ({subToDeactivate.Email}) adresine gönderim başarısız oldu ve pasife alındı.",
                                        CreatedAt = DateTime.Now,
                                        IsRead = false,
                                        UserId = userId
                                    });
                                }
                            }
                        }
                        catch (Exception ex)
                        {
                            log.IsSuccess = false;
                            log.ErrorMessage = MailErrorHelper.GetFriendlyMessage(ex.Message);

                            // Hemen hata (format vs.) veriyorsa aboneyi direkt pasife al
                            var subToUpdate = bgDb.Subscribers.Find(sub.Id);
                            if (subToUpdate != null)
                            {
                                subToUpdate.IsActive = false;
                                bgDb.Notifications.Add(new Notification
                                {
                                    Title = "Gönderim Hatası (Pasife Alındı)",
                                    Message = $"{(subToUpdate.FirstName ?? "")} {(subToUpdate.LastName ?? "")} ({subToUpdate.Email}) adresine gönderim hemen başarısız oldu ve pasife alındı.",
                                    CreatedAt = DateTime.Now,
                                    IsRead = false,
                                    UserId = userId
                                });
                            }
                        }

                        bgDb.MailLogs.Add(log);
                    }

                    bgDb.SaveChanges();

                    var currentUser = bgDb.Users.Find(userId);
                    if (currentUser != null)
                    {
                        var bounceManager = new BounceCheckManager();
                        await bounceManager.CheckBouncesForUserAsync(currentUser);
                    }
                }
            });

            var groupNames = selectedGroups.Select(g => g.GroupName).ToList();
            var groupNamesStr = groupNames.Any() ? string.Join(", ", groupNames) : $"Grup ID'leri: {string.Join(",", request.GroupIds)}";
            LogManager.LogAction(userId, "Kampanya Başlatıldı", $"Seçilen klasörler ('{groupNamesStr}') içindeki {totalCount} kişiye mail gönderimi başlatıldı. Konu: {subject}");

            return Ok(new { message = $"{totalCount} kişiye gönderim arka planda başlatıldı. Raporlar ekranından takip edebilirsiniz." });
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

public class CampaignRequest
{
    public string Subject { get; set; } = string.Empty;
    public string Body { get; set; } = string.Empty;
    public int TemplateId { get; set; }
}

public class MultiGroupCampaignRequest : CampaignRequest
{
    public List<int> GroupIds { get; set; } = new List<int>();
}
