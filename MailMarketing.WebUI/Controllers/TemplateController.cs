using Microsoft.AspNetCore.Mvc;
using MailMarketing.Business;
using MailMarketing.Entity;
using MailMarketing.DataAccess;
using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using System.Linq;
using System;
using System.Collections.Generic;
using Mammoth; 
using System.IO; 
using Microsoft.AspNetCore.Http;

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class TemplateController : Controller
{
    private readonly TemplateManager _templateManager = new TemplateManager();
    private readonly MailService _mailService = new MailService();
    private readonly MailMarketingContext _context = new MailMarketingContext();

    // 📊 1. ŞABLON LİSTESİ
    public IActionResult Index(string? searchString, string? status, int page = 1)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int pageSize = 6; 

        var query = _context.Templates.Where(t => t.UserId == currentUserId).AsQueryable();

        if (!string.IsNullOrEmpty(searchString))
        {
            query = query.Where(t => t.Title != null && t.Title.Contains(searchString));
            ViewBag.SearchString = searchString;
        }

        if (status == "active") query = query.Where(t => t.IsActive);
        else if (status == "passive") query = query.Where(t => !t.IsActive);
        ViewBag.CurrentStatus = status;

        int totalRecords = query.Count();
        int totalPages = (int)Math.Ceiling(totalRecords / (double)pageSize);
        page = page < 1 ? 1 : (totalPages > 0 && page > totalPages ? totalPages : page);

        var templates = query.OrderByDescending(t => t.Id)
                             .Skip((page - 1) * pageSize)
                             .Take(pageSize)
                             .ToList();

        ViewBag.CurrentPage = page;
        ViewBag.TotalPages = totalPages;
        ViewBag.TotalRecords = totalRecords;

        ViewBag.Groups = _context.SubscriberGroups
                               .Where(g => g.UserId == currentUserId)
                               .OrderBy(g => g.GroupName)
                               .ToList();

        return View(templates);
    }

    // 🔥 WORD DOSYASINI İÇE AKTAR
    [HttpPost]
    public IActionResult ImportFromWord(IFormFile wordFile)
    {
        if (wordFile == null || wordFile.Length == 0)
        {
            TempData["Error"] = "Lütfen geçerli bir Word dosyası seçin.";
            return RedirectToAction("Index");
        }

        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        try 
        {
            using (var stream = wordFile.OpenReadStream())
            {
                var converter = new DocumentConverter();
                var result = converter.ConvertToHtml(stream); 
                
                var importedTemplate = new Template
                {
                    Title = Path.GetFileNameWithoutExtension(wordFile.FileName),
                    Content = result.Value 
                };

                // 🔥 LOG: Word aktarımı
                LogManager.LogAction(currentUserId, "Word Aktarımı", $"'{wordFile.FileName}' dosyasından şablon içeriği başarıyla aktarıldı.");

                TempData["Message"] = "Word dokümanı başarıyla aktarıldı! Şimdi son kontrolleri yapabilirsin. 📄✨";
                return View("Create", importedTemplate);
            }
        }
        catch (Exception ex)
        {
            TempData["Error"] = "Word dönüştürme hatası: " + ex.Message;
            return RedirectToAction("Index");
        }
    }

    // 2. DURUM DEĞİŞTİRME
    public IActionResult ToggleStatus(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        var template = _context.Templates.FirstOrDefault(t => t.Id == id && t.UserId == currentUserId);

        if (template != null)
        {
            template.IsActive = !template.IsActive; 
            _context.Templates.Update(template);
            _context.SaveChanges();

            // 🔥 LOG: Şablon durumu (pasife/aktife alma)
            string statusText = template.IsActive ? "aktife" : "pasife";
            LogManager.LogAction(currentUserId, "Şablon Durumu Değişti", $"'{template.Title}' şablonu {statusText} alındı.");
            
            TempData["Message"] = $"Şablon durumu '{statusText}' olarak güncellendi. ✅";
        }
        return RedirectToAction("Index");
    }

    // 3. TOPLU İŞLEMLER
    [HttpPost]
    public IActionResult BulkDelete(int[] selectedIds)
    {
        if (selectedIds == null || selectedIds.Length == 0) return RedirectToAction("Index");
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        int skipped = 0;
        int deleted = 0;

        using (var db = new MailMarketingContext()) {
            var items = db.Templates.Where(t => selectedIds.Contains(t.Id) && t.UserId == currentUserId).ToList();
            foreach (var item in items) {
                if (db.MailLogs.Any(l => l.TemplateId == item.Id)) { skipped++; continue; }
                db.Templates.Remove(item);
                deleted++;
            }
            db.SaveChanges();

            // 🔥 LOG: Toplu silme
            LogManager.LogAction(currentUserId, "Toplu Şablon Silme", $"{deleted} adet şablon silindi, {skipped} adet şablon kullanımda olduğu için atlandı.");

            if (skipped > 0) TempData["Error"] = $"{skipped} adet şablon gönderim geçmişi olduğu için silinemedi.";
            else TempData["Message"] = "Seçilen şablonlar başarıyla silindi. ✅";
        }
        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult BulkActivate(int[] selectedIds)
    {
        if (selectedIds == null || selectedIds.Length == 0) return RedirectToAction("Index");
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext()) {
            var items = db.Templates.Where(t => selectedIds.Contains(t.Id) && t.UserId == currentUserId).ToList();
            foreach (var item in items) item.IsActive = true;
            db.SaveChanges();

            // 🔥 LOG: Toplu aktivasyon
            LogManager.LogAction(currentUserId, "Toplu Şablon Aktivasyonu", $"{items.Count} adet şablon toplu olarak aktife çekildi.");

            TempData["Message"] = $"{items.Count} şablon aktifleştirildi. 🟢";
        }
        return RedirectToAction("Index");
    }

    [HttpPost]
    public IActionResult BulkDeactivate(int[] selectedIds)
    {
        if (selectedIds == null || selectedIds.Length == 0) return RedirectToAction("Index");
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext()) {
            var items = db.Templates.Where(t => selectedIds.Contains(t.Id) && t.UserId == currentUserId).ToList();
            foreach (var item in items) item.IsActive = false;
            db.SaveChanges();

            // 🔥 LOG: Toplu deaktivasyon
            LogManager.LogAction(currentUserId, "Toplu Şablon Deaktivasyonu", $"{items.Count} adet şablon toplu olarak pasife çekildi.");

            TempData["Message"] = $"{items.Count} şablon pasife alındı. 🟠";
        }
        return RedirectToAction("Index");
    }

    [HttpGet]
    public IActionResult Create() => View();

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Create(Template template)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!string.IsNullOrEmpty(sid))
        {
            int currentUserId = int.Parse(sid);
            template.UserId = currentUserId; 
            template.CreatedDate = DateTime.Now;
            template.IsActive = true; 

            string result = _templateManager.Add(template);
            if (result == "OK")
            {
                // 🔥 LOG: Şablon oluşturma
                LogManager.LogAction(currentUserId, "Şablon Oluşturuldu", $"'{template.Title}' isimli yeni bir şablon oluşturuldu.");
                
                TempData["Message"] = "Şablon başarıyla kaydedildi! 🎨";
                return RedirectToAction("Index");
            }
            else
            {
                TempData["Error"] = result;
            }
        }
        return View(template);
    }

    [HttpGet]
    public IActionResult Edit(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var template = _context.Templates.FirstOrDefault(t => t.Id == id && t.UserId == int.Parse(sid!));
        if (template == null) return RedirectToAction("Index");
        return View(template);
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public IActionResult Edit(Template template)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        template.UserId = currentUserId; // UserId set etmeyi unutmayalım

        string result = _templateManager.Update(template);

        if (result == "OK")
        {
            // 🔥 LOG: Şablon düzenleme
            LogManager.LogAction(currentUserId, "Şablon Düzenlendi", $"'{template.Title}' isimli şablon güncellendi.");
            
            TempData["Message"] = "Şablon güncellendi! 📝";
            return RedirectToAction("Index");
        }
        else
        {
            TempData["Error"] = result;
            return RedirectToAction("Index"); // Veya View(template) dönebiliriz ama mevcut yapı Index'e atıyor
        }
    }

    public IActionResult Delete(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        var template = _context.Templates.FirstOrDefault(t => t.Id == id && t.UserId == currentUserId);

        if (template != null)
        {
            if (_context.MailLogs.Any(l => l.TemplateId == id))
            {
                TempData["Error"] = "Bu şablon daha önce kullanıldığı için silinemez!";
                return RedirectToAction("Index");
            }

            string title = template.Title!;
            _context.Templates.Remove(template);
            _context.SaveChanges();
            
            // 🔥 LOG: Şablon silme
            LogManager.LogAction(currentUserId, "Şablon Silindi", $"'{title}' isimli şablon sistemden kaldırıldı.");
            
            TempData["Message"] = "Şablon silindi! 🗑️";
        }
        return RedirectToAction("Index");
    }

    [HttpGet]
    public IActionResult Send(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        var template = _context.Templates.FirstOrDefault(t => t.Id == id && t.UserId == currentUserId);
        
        if (template == null || !template.IsActive) 
        {
            TempData["Error"] = "Şablon bulunamadı veya gönderim için uygun değil.";
            return RedirectToAction("Index");
        }

        ViewBag.Template = template; 
        ViewBag.Groups = _context.SubscriberGroups.Where(g => g.UserId == currentUserId).OrderBy(g => g.GroupName).ToList();
        var subscribers = _context.Subscribers.Where(s => s.UserId == currentUserId && s.IsActive).OrderBy(s => s.FirstName).ToList();
        ViewBag.GroupMembers = _context.SubscriberGroupMembers.ToList();

        return View(subscribers);
    }

    [HttpPost]
    public IActionResult Send(int templateId, int[] subscriberIds)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        var template = _context.Templates.FirstOrDefault(t => t.Id == templateId && t.UserId == currentUserId);
        
        if (template == null || subscriberIds == null || subscriberIds.Length == 0)
        {
            TempData["Error"] = "Gönderim yapılamadı.";
            return RedirectToAction("Index");
        }

        string result = _mailService.SendBulkMail(templateId, subscriberIds, currentUserId);

        if (result == "OK")
        {
            // 🔥 LOG: Şablon ismi ve kişi sayısı detayı
            LogManager.LogAction(currentUserId, "Mail Gönderildi", $"'{template.Title}' şablonu kullanılarak {subscriberIds.Length} kişiye toplu mail gönderildi.");
            
            TempData["Message"] = "Mail gönderimi başarıyla başlatıldı! 🚀";
            return RedirectToAction("Index");
        }
        
        TempData["Error"] = "SMTP Hatası: " + result;
        return RedirectToAction("Index");
    }

    [HttpGet]
    public IActionResult GetPreview(int id)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        var template = _context.Templates.FirstOrDefault(t => t.Id == id && t.UserId == currentUserId);
        if (template == null) return NotFound();

        return Json(new { id = template.Id, title = template.Title, content = template.Content });
    }
}