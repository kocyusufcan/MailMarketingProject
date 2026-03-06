using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using MailMarketing.Business; // SecurityHelper için eklendi
using System.Security.Claims;

namespace MailMarketing.API.Controllers;

[Route("api/[controller]")]
[ApiController]
[Authorize]
public class SettingsController : ControllerBase
{
    private int GetCurrentUserId() => int.Parse(User.FindFirst(ClaimTypes.NameIdentifier)?.Value ?? "0");

    // 1. Kullanıcının SMTP Ayarlarını Getir
    [HttpGet("smtp")]
    public IActionResult GetSmtpSettings()
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            try 
            {
                // 🔥 ÖNEMLİ: Artık orijinal 'Settings' tablosuna bakıyoruz
                var settings = db.Settings.FirstOrDefault(s => s.UserId == userId);
                
                // Ayar yoksa boş form göstermek için varsayılan değerler döndür (404 değil)
                if (settings == null)
                {
                    return Ok(new { mailServer = "", port = 587, email = "", password = "", enableSSL = true });
                }

                // Şifreyi mobilde formda düz metin görebilmesi için çözüyoruz (WebUI gibi)
                if (!string.IsNullOrEmpty(settings.Password))
                {
                    settings.Password = SecurityHelper.Decrypt(settings.Password);
                }

                return Ok(settings);
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Ayarlar alınırken hata: " + ex.Message });
            }
        }
    }

    // 2. SMTP Ayarlarını Kaydet/Güncelle
    [HttpPost("smtp")]
    public IActionResult SaveSmtpSettings([FromBody] Setting model)
    {
        var userId = GetCurrentUserId();
        if (userId == 0) return Unauthorized();

        using (var db = new MailMarketingContext())
        {
            try 
            {
                var existing = db.Settings.FirstOrDefault(s => s.UserId == userId);
                
                // WebUI ile uyumlu şifreleme
                if (!string.IsNullOrEmpty(model.Password))
                {
                    model.Password = SecurityHelper.Encrypt(model.Password);
                }

                if (existing != null)
                {
                    existing.MailServer = model.MailServer;
                    existing.Port = model.Port;
                    existing.Email = model.Email;
                    existing.Password = model.Password;
                    existing.EnableSSL = model.EnableSSL;
                    db.Settings.Update(existing);
                }
                else
                {
                    model.UserId = userId;
                    db.Settings.Add(model);
                }
                db.SaveChanges();
                return Ok(new { message = "SMTP ayarları başarıyla kaydedildi!" });
            }
            catch (System.Exception ex)
            {
                return BadRequest(new { message = "Ayarlar kaydedilirken hata: " + ex.Message });
            }
        }
    }
}