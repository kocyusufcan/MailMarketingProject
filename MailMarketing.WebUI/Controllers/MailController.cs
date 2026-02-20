using Microsoft.AspNetCore.Mvc;
using MailMarketing.Business;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims; 
using MailMarketing.DataAccess; 
using System.Linq;

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class MailController : Controller
{
    private readonly MailService _mailService = new MailService();
    private readonly MailMarketingContext _context = new MailMarketingContext(); 

    [HttpPost]
    public IActionResult SendBulk(int templateId, int[] subscriberIds)
    {
        // 1. Giriş yapan kullanıcının ID'sini alıyoruz
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrEmpty(sid)) return RedirectToAction("Login", "Account");
        
        int currentUserId = int.Parse(sid);

        // NOT: Eski SMTP kontrolünü kaldırdık. 
        // Çünkü artık MailService, 'Settings' tablosuna bakarak bu kontrolü yapıyor.
        // Eğer ayar yoksa Service zaten "Hata: SMTP bilgileriniz eksik!" diyecek.

        // 2. Hiç kimse seçilmediyse hata verelim
        if (subscriberIds == null || subscriberIds.Length == 0)
        {
            TempData["ErrorMessage"] = "Lütfen mail gönderilecek en az bir kişi seçin!";
            return RedirectToAction("Index", "Home");
        }

        // 3. Mail gönderimini başlat
        string result = _mailService.SendBulkMail(templateId, subscriberIds, currentUserId);

        // 4. Sonuca göre kullanıcıya bilgi veriyoruz
        if (result == "OK")
        {
            TempData["Message"] = $"{subscriberIds.Length} kişiye gönderim başarıyla başlatıldı.";
        }
        else
        {
            // Servisten dönen hata mesajını (orn: SMTP ayarları eksik) kullanıcıya gösteriyoruz
            TempData["ErrorMessage"] = result;
        }

        return RedirectToAction("Index", "Home");
    }
}