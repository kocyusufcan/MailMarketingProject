using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using MailMarketing.Business; 
using Microsoft.EntityFrameworkCore;
using System.Text.Json;
using MailMarketing.Entity;
using System.Collections.Generic;
using System;
using System.Threading.Tasks;
using System.Net;
using System.Net.Mail;

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class HomeController : Controller
{
    private readonly IConfiguration _configuration;

    public HomeController(IConfiguration configuration)
    {
        _configuration = configuration;
    }

    private readonly MailMarketingContext _context = new MailMarketingContext();
    // MailService tanımı
    private readonly MailService _mailService = new MailService(); 

    private static readonly object _bounceLock = new object();

    // --- 1. LANDING VE DASHBOARD ---

    [AllowAnonymous]
    public IActionResult Index()
    {
        if (User.Identity != null && User.Identity.IsAuthenticated)
        {
            return RedirectToAction("Dashboard"); 
        }

        // 1. Landing Sayfası
        // Veriler AJAX ile çekileceği için başlangıçta boş model gönderilir.
        using (var db = new MailMarketingContext())
        {
            // Başlangıçta boş liste gönderilir, içerik AJAX ile yüklenir.
            return View("Landing", new List<MailMarketing.Entity.User>()); 
        }
    }

    [HttpGet]
    [AllowAnonymous]
    public IActionResult SearchPublicUsers(string term = "", int page = 1)
    {
        int pageSize = 10;
        try 
        {
            using (var db = new MailMarketingContext())
            {
                var query = db.Users.Where(u => u.IsPublic).AsQueryable();

                if (!string.IsNullOrWhiteSpace(term))
                {
                    term = term.ToLower();
                    query = query.Where(u => 
                        (u.DisplayName != null && u.DisplayName.ToLower().Contains(term)) ||
                        (u.FirstName != null && u.FirstName.ToLower().Contains(term)) ||
                        (u.LastName != null && u.LastName.ToLower().Contains(term))
                    );
                }

                var totalCount = query.Count();
                
                // BrandName [NotMapped] olduğundan SQL sorgusu için DisplayName kullanılır; sonuçlar belleğe alındıktan sonra BrandName computed property'si çalışır.
                var rawUsers = query.OrderBy(u => u.DisplayName ?? u.FirstName) 
                                 .Skip((page - 1) * pageSize)
                                 .Take(pageSize)
                                 .Select(u => new { u.Id, u.DisplayName, u.FirstName, u.LastName })
                                 .ToList();

                var users = rawUsers.Select(u => new 
                                 {
                                     id = u.Id,
                                     name = !string.IsNullOrEmpty(u.DisplayName) ? u.DisplayName : $"{u.FirstName} {u.LastName}".Trim()
                                 })
                                 .ToList();

                return Json(new { totalCount, page, pageSize, items = users });
            }
        }
        catch 
        {
            // Hata durumunda (DB erişim sorunu vs.) boş liste dönerek arayüzün bozulmasını engelliyoruz
            return Json(new { totalCount = 0, page, pageSize, items = new List<object>() });
        }
    }

    [AllowAnonymous]
    public IActionResult About()
    {
        if (User.Identity is { IsAuthenticated: true }) return RedirectToAction("Dashboard");
        return View();
    }

    [AllowAnonymous]
    public IActionResult Contact()
    {
        if (User.Identity is { IsAuthenticated: true }) return RedirectToAction("Dashboard");
        ViewBag.ContactInfo = _configuration.GetSection("ContactInfo");
        ViewBag.SocialMedia = _configuration.GetSection("SocialMedia");
        return View();
    }

    [HttpPost]
    [AllowAnonymous]
    public IActionResult Contact(string name, string surname, string email, string subject, string message)
    {
        try
        {
            string toEmail = _configuration["ContactInfo:Email"] ?? "info@mailmarketing.com";
                string body = $@"
                <!DOCTYPE html>
                <html>
                <head>
                    <style>
                        body {{ background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }}
                        .container {{ padding: 40px 20px; }}
                        .card {{ background-color: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06); border: 1px solid #e2e8f0; }}
                        .header {{ background: linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%); padding: 30px; color: #ffffff; }}
                        .header h2 {{ margin: 0; font-size: 24px; font-weight: 600; text-align: center; }}
                        .content {{ padding: 30px; }}
                        .field-group {{ margin-bottom: 20px; }}
                        .label {{ color: #64748b; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 5px; }}
                        .value {{ color: #1e293b; font-size: 16px; font-weight: 500; }}
                        .message-box {{ background-color: #f1f5f9; padding: 20px; border-radius: 8px; color: #334155; line-height: 1.6; margin-top: 10px; border-left: 4px solid #3b82f6; }}
                        .footer {{ background-color: #f8fafc; padding: 20px; text-align: center; border-top: 1px solid #e2e8f0; color: #94a3b8; font-size: 13px; }}
                    </style>
                </head>
                <body>
                    <div class='container'>
                        <div class='card'>
                            <div class='header'>
                                <h2>📬 Yeni İletişim Mesajı</h2>
                            </div>
                            <div class='content'>
                                <div class='field-group'>
                                    <div class='label'>GÖNDEREN</div>
                                    <div class='value'>{name} {surname}</div>
                                </div>
                                <div class='field-group'>
                                    <div class='label'>E-POSTA</div>
                                    <div class='value'><a href='mailto:{email}' style='color:#3b82f6;text-decoration:none;'>{email}</a></div>
                                </div>
                                <div class='field-group'>
                                    <div class='label'>KONU</div>
                                    <div class='value'>{subject}</div>
                                </div>
                                <div class='field-group'>
                                    <div class='label'>MESAJ İÇERİĞİ</div>
                                    <div class='message-box'>
                                        {message.Replace("\n", "<br>")}
                                    </div>
                                </div>
                            </div>
                            <div class='footer'>
                                © {DateTime.Now.Year} MailMarketing İletişim Formu
                            </div>
                        </div>
                    </div>
                </body>
                </html>";

            _mailService.SendSystemEmail(toEmail, $"İletişim Formu: {subject}", body);
            TempData["Message"] = "Mesajınız başarıyla gönderildi. En kısa sürede dönüş yapacağız.";
        }
        catch (Exception ex)
        {
            TempData["Error"] = "Mesaj gönderilirken bir hata oluştu: " + ex.Message;
        }

        return RedirectToAction("Contact");
    }

    public IActionResult Dashboard()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return RedirectToAction("Login", "Account");
        int currentUserId = int.Parse(sid);

        using (var db = new MailMarketingContext())
        {
            var userTemplateIds = db.Templates.Where(t => t.UserId == currentUserId).Select(t => t.Id).ToList();

            // Sayaçlar
            ViewBag.TotalSubscribers = db.Subscribers.Count(s => s.UserId == currentUserId && s.IsActive);
            var totalLogsCount = db.MailLogs.Count(l => l.TemplateId.HasValue && userTemplateIds.Contains(l.TemplateId.Value));
            ViewBag.TotalMailsSent = totalLogsCount;

            if (totalLogsCount > 0)
            {
                var successCount = db.MailLogs.Count(l => l.IsSuccess && l.TemplateId.HasValue && userTemplateIds.Contains(l.TemplateId.Value));
                ViewBag.SuccessRate = (successCount * 100) / totalLogsCount;
            }
            else { ViewBag.SuccessRate = 0; }

            ViewBag.Groups = null; // Klasörler AJAX ile yüklenir
            ViewBag.Templates = null; // Şablonlar AJAX ile yüklenir
            ViewBag.TotalTemplates = db.Templates.Count(t => t.UserId == currentUserId && t.IsActive);
            ViewBag.TotalGroups = db.SubscriberGroups.Count(g => g.UserId == currentUserId);
            // Aboneler AJAX ile yüklenir, sayfa açılışında veri çekilmez

            // Grafik Verileri
            var last7Days = Enumerable.Range(0, 7).Select(i => DateTime.Today.AddDays(-i)).OrderBy(d => d).ToList();
            var dailyStats = new List<int>();
            var dailyLabels = new List<string>();

            foreach (var day in last7Days)
            {
                var count = db.MailLogs.Count(l => l.SentDate.Date == day.Date && l.TemplateId.HasValue && userTemplateIds.Contains(l.TemplateId.Value));
                dailyStats.Add(count);
                dailyLabels.Add(day.ToString("dd MMM"));
            }

            ViewBag.ChartLabels = JsonSerializer.Serialize(dailyLabels);
            ViewBag.ChartData = JsonSerializer.Serialize(dailyStats);
        }

        return View();
    }
    // --- AJAX: ABONE ARAMA (Dashboard Alıcı Listesi) ---

    [HttpGet]
    public IActionResult SearchSubscribersAjax(string term = "", string groupIds = "", int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);
        int pageSize = 30;

        using (var db = new MailMarketingContext())
        {
            var query = db.Subscribers.Where(s => s.UserId == currentUserId && s.IsActive).AsQueryable();

            // Çoklu klasör filtresi
            if (!string.IsNullOrWhiteSpace(groupIds))
            {
                var idList = groupIds.Split(',')
                    .Where(x => int.TryParse(x.Trim(), out _))
                    .Select(x => int.Parse(x.Trim()))
                    .ToList();

                if (idList.Any())
                {
                    var memberIds = db.SubscriberGroupMembers
                        .Where(m => idList.Contains(m.GroupId))
                        .Select(m => m.SubscriberId)
                        .Distinct()
                        .ToList();
                    query = query.Where(s => memberIds.Contains(s.Id));
                }
            }

            // Arama filtresi
            if (!string.IsNullOrWhiteSpace(term))
            {
                query = query.Where(s => (s.Email != null && s.Email.Contains(term)) || (s.FirstName != null && s.FirstName.Contains(term)) || (s.LastName != null && s.LastName.Contains(term)));
            }

            var totalCount = query.Count();
            var results = query.OrderBy(s => s.FirstName)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .Select(s => new { s.Id, s.FirstName, s.LastName, s.Email, s.IsActive })
                               .ToList();

            return Json(new { totalCount, page, pageSize, data = results });
        }
    }

    // --- AJAX: ŞABLON ARAMA (Dashboard) ---

    [HttpGet]
    public IActionResult SearchTemplatesAjax(string term = "", int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);
        int pageSize = 30;

        using (var db = new MailMarketingContext())
        {
            var query = db.Templates.Where(t => t.UserId == currentUserId && t.IsActive).AsQueryable();

            if (!string.IsNullOrWhiteSpace(term))
            {
                query = query.Where(t => t.Title.Contains(term));
            }

            var totalCount = query.Count();
            var results = query.OrderByDescending(t => t.Id)
                                .Skip((page - 1) * pageSize)
                                .Take(pageSize)
                                .Select(t => new { t.Id, t.Title })
                                .ToList();

            return Json(new { totalCount, page, pageSize, data = results });
        }
    }

    // --- AJAX: KLASÖR ARAMA (Dashboard) ---

    [HttpGet]
    public IActionResult SearchGroupsDashboardAjax(string term = "", int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);
        int pageSize = 30;

        using (var db = new MailMarketingContext())
        {
            var query = db.SubscriberGroups.Where(g => g.UserId == currentUserId).AsQueryable();

            if (!string.IsNullOrWhiteSpace(term))
            {
                query = query.Where(g => g.GroupName.Contains(term));
            }

            var totalCount = query.Count();
            var results = query.OrderBy(g => g.GroupName)
                               .Skip((page - 1) * pageSize)
                               .Take(pageSize)
                               .Select(g => new { g.Id, g.GroupName })
                               .ToList();

            return Json(new { totalCount, page, pageSize, data = results });
        }
    }

    // --- 2. MAİL GÖNDERİMİ (ARTIK MERKEZİ SİSTEMİ KULLANIYOR) ---

    [HttpPost]
    public IActionResult SendMail(int? templateId, int[] subscriberIds, bool sendToAll = false)
    {
        // 1. Kullanıcı Bilgisi
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        // 2. "Tüm Abonelere Gönder" seçeneği: Sunucu tarafında aktif aboneler çekilir.
        if (sendToAll)
        {
            using (var db = new MailMarketingContext())
            {
                subscriberIds = db.Subscribers
                    .Where(s => s.UserId == currentUserId && s.IsActive)
                    .Select(s => s.Id)
                    .ToArray();
            }
        }

        // 3. Kontroller
        if (templateId == null || templateId == 0 || subscriberIds == null || subscriberIds.Length == 0)
        {
            TempData["Error"] = "Lütfen şablon ve alıcı seçimini kontrol edin.";
            return RedirectToAction("Dashboard");
        }

        // 4. Loglama (Dashboard'dan atıldığını belirtmek için)
        using (var db = new MailMarketingContext())
        {
            var template = db.Templates.Find(templateId);
            if (template != null)
            {
               LogManager.LogAction(currentUserId, "Mail Gönderimi", $"Dashboard üzerinden '{template.Title}' şablonu gönderimi başlatıldı.");
            }
        }

        // 4. Mail gönderimi için MailService kullanılır.
        // Footer, abonelikten ayrılma linki ve dinamik içerik otomatik eklenir.
        string result = _mailService.SendBulkMail(templateId.Value, subscriberIds, currentUserId);

        if (result == "OK")
        {
            TempData["Message"] = "Toplu gönderim başarıyla başlatıldı.";
        }
        else
        {
            // Kısmi başarı veya hata durumları
            if (result.Contains("Kısmi"))
                TempData["Message"] = result;
            else
                TempData["Error"] = result;
        }

        return RedirectToAction("Dashboard");
    }

    // --- 3. BOUNCE YÖNETİMİ ---

    [HttpPost] 
    public IActionResult CheckMyBounces() 
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Unauthorized();
        int currentUserId = int.Parse(sid);

        lock (_bounceLock)
        {
            using (var db = new MailMarketingContext())
            {
                var user = db.Users.Find(currentUserId);
                if (user == null) return NotFound();

                var lastNotification = db.Notifications
                    .Where(n => n.UserId == currentUserId && n.Title == "İletim Hatası")
                    .OrderByDescending(n => n.CreatedAt).FirstOrDefault();

                if (lastNotification != null && (DateTime.Now - lastNotification.CreatedAt).TotalSeconds < 5)
                {
                    return Json(new { status = "already_processed" });
                }

                var checker = new BounceCheckManager();
                checker.CheckBouncesForUserAsync(user).GetAwaiter().GetResult(); 
                
                var pasifIds = db.Subscribers.Where(s => s.UserId == currentUserId && !s.IsActive).Select(s => s.Id).ToList();
                
                var duzeltilecekLoglar = db.MailLogs
                    .Where(l => l.SubscriberId.HasValue && pasifIds.Contains(l.SubscriberId.Value) && l.IsSuccess)
                    .OrderByDescending(l => l.SentDate)
                    .ToList();

                foreach (var log in duzeltilecekLoglar)
                {
                    log.IsSuccess = false;
                    log.ErrorMessage = "Mail iletilemedi (Bounce: Sunucu reddetti).";
                }
                
                db.SaveChanges();
                LogManager.LogAction(currentUserId, "Bounce Kontrolü", "Gelmeyen mailler kontrol edildi.");
                
                return Json(new { status = "success", count = duzeltilecekLoglar.Count });
            }
        }
    }

    // --- 4. BİLDİRİM YÖNETİMİ ---

    public IActionResult Notifications(int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int pageSize = 10; 

        using (var db = new MailMarketingContext())
        {
            var query = db.Notifications.Where(n => n.UserId == currentUserId);
            var totalNotifs = query.Count();
            var myNotifs = query.OrderByDescending(n => n.CreatedAt).Skip((page - 1) * pageSize).Take(pageSize).ToList();
            
            ViewBag.CurrentPage = page;
            ViewBag.TotalPages = (int)Math.Ceiling((double)totalNotifs / pageSize);
            ViewBag.TotalCount = totalNotifs;
            return View(myNotifs);
        }
    }

    [HttpGet]
    public IActionResult GetNotifications()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return Json(new { totalCount = 0, list = new List<object>() });
        int currentUserId = int.Parse(sid);

        using (var db = new MailMarketingContext())
        {
            var totalUnreadCount = db.Notifications.Count(n => n.UserId == currentUserId && !n.IsRead);
            var recentNotifs = db.Notifications.Where(n => n.UserId == currentUserId && !n.IsRead)
                               .OrderByDescending(n => n.CreatedAt).Take(5)
                               .Select(n => new { n.Id, n.Title, n.Message, CreatedAt = n.CreatedAt.ToString("HH:mm") }).ToList();
            return Json(new { totalCount = totalUnreadCount, list = recentNotifs });
        }
    }

    [HttpPost]
    public IActionResult MarkAsRead(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        using (var db = new MailMarketingContext()) {
            var notif = db.Notifications.FirstOrDefault(n => n.Id == id && n.UserId == currentUserId);
            if (notif != null) { notif.IsRead = true; db.SaveChanges(); }
            return Ok();
        }
    }

    [HttpPost]
    public IActionResult MarkAllNotificationsAsRead()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        using (var db = new MailMarketingContext()) {
            var unread = db.Notifications.Where(n => n.UserId == currentUserId && !n.IsRead).ToList();
            foreach (var n in unread) { n.IsRead = true; }
            db.SaveChanges();
            return Ok();
        }
    }

    [HttpPost] 
    public IActionResult DeleteNotification(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        using (var db = new MailMarketingContext()) {
            var notif = db.Notifications.FirstOrDefault(n => n.Id == id && n.UserId == currentUserId);
            if (notif != null) { db.Notifications.Remove(notif); db.SaveChanges(); return Ok(); }
            return NotFound();
        }
    }

    // --- 5. ABONELİK, DOĞRULAMA VE AYRILMA ---

    [HttpPost]
    [AllowAnonymous]
    public IActionResult Subscribe(string firstName, string lastName, string email, int targetUserId)
    {
        if (string.IsNullOrEmpty(email)) return RedirectToAction("Index");
        
        using (var db = new MailMarketingContext()) 
        {
            if (db.Subscribers.Any(s => s.Email == email && s.UserId == targetUserId))
            {
                TempData["Error"] = "Bu e-posta adresiyle bu bültene zaten abonesiniz.";
                return RedirectToAction("Index");
            }
            
            string subCode = new Random().Next(100000, 999999).ToString();
            var tempSub = new Subscriber { Email = email, FirstName = firstName, LastName = lastName, UserId = targetUserId, IsActive = false };
            
            try {
                _mailService.SendActivationCode(email, subCode);
            } catch { }

            TempData["TempSubData"] = JsonSerializer.Serialize(tempSub);
            TempData["SubCode"] = subCode;
            ViewBag.Step = 2; ViewBag.TargetEmail = email; ViewBag.TargetUserId = targetUserId;
            
            return View("Landing", db.Users.Where(u => u.IsPublic).ToList()); 
        }
    }

    [HttpPost]
    [AllowAnonymous]
    public IActionResult VerifySubscription(string code)
    {
        string? savedCode = TempData["SubCode"]?.ToString();
        string? subDataJson = TempData["TempSubData"]?.ToString();
        
        if (savedCode == code && !string.IsNullOrEmpty(subDataJson)) {
            var sub = JsonSerializer.Deserialize<Subscriber>(subDataJson);
            using (var db = new MailMarketingContext()) {
                if(sub != null) { 
                    sub.IsActive = true; 
                    sub.CreatedDate = DateTime.Now; 
                    db.Subscribers.Add(sub); 
                    db.SaveChanges(); 

                    var creator = db.Users.Find(sub.UserId);
                    if (creator != null) {
                        string creatorName = !string.IsNullOrEmpty(creator.DisplayName) 
                                             ? creator.DisplayName 
                                             : $"{creator.FirstName} {creator.LastName}";

                        try {
                            _mailService.SendSubscriberWelcomeMail(sub.Email!, $"{sub.FirstName} {sub.LastName}", creatorName);
                        } catch { }
                    }
                }
            }
            TempData["Message"] = "Aboneliğiniz başarıyla onaylandı.";
            return RedirectToAction("Index");
        }
        
        TempData["Error"] = "Girdiğiniz kod hatalı!";
        return RedirectToAction("Index");
    }

    // ABONELİKTEN AYRILMA (Unsubscribe)
    [AllowAnonymous]
    public IActionResult Unsubscribe(string email, int token)
    {
        if (string.IsNullOrEmpty(email)) return RedirectToAction("Index");

        using (var db = new MailMarketingContext())
        {
            var subscriber = db.Subscribers.FirstOrDefault(s => s.Email == email && s.Id == token);
            
            if (subscriber != null)
            {
                if (subscriber.IsActive)
                {
                    subscriber.IsActive = false;
                    db.SaveChanges();
                    LogManager.LogAction(subscriber.UserId, "Abonelikten Ayrılma", $"'{email}' adresi mail altındaki linke tıklayarak listeden ayrıldı.");
                }
                
                ViewBag.Email = email;
                return View(); // Unsubscribe.cshtml sayfasına yönlendirir
            }
        }
        
        return RedirectToAction("Index");
    }
}