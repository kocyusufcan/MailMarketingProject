using Microsoft.AspNetCore.Mvc;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Linq;
using Microsoft.AspNetCore.Authorization;
using MailMarketing.Business; 

namespace MailMarketing.WebUI.Controllers;

[Authorize]
public class SettingController : Controller
{
    // SAYFAYI AÇMA (GET)
    public IActionResult Index()
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);

        using (var db = new MailMarketingContext())
        {
            var setting = db.Settings.FirstOrDefault(s => s.UserId == currentUserId);

            if (setting == null)
            {
                setting = new Setting { UserId = currentUserId };
            }
            else
            {
                // 🔥 KRİTİK DÜZELTME: Şifreyi kullanıcıya göstermeden önce ÇÖZÜYORUZ
                if (!string.IsNullOrEmpty(setting.Password))
                {
                    try 
                    { 
                        setting.Password = SecurityHelper.Decrypt(setting.Password); 
                    } 
                    catch 
                    { 
                        // Eğer şifre zaten düz metinse veya çözülemiyorsa hata vermesin
                    }
                }
            }

            return View(setting);
        }
    }

    // AYARLARI KAYDETME (POST)
    [HttpPost]
    public IActionResult Update(Setting model)
    {
        var sid = User.FindFirstValue(ClaimTypes.NameIdentifier);
        int currentUserId = int.Parse(sid!);
        
        using (var db = new MailMarketingContext())
        {
            var existingSetting = db.Settings.FirstOrDefault(s => s.UserId == currentUserId);

            if (existingSetting == null)
            {
                // Yeni kayıt
                model.UserId = currentUserId;
                
                // Şifreyi şifreleyerek veritabanına koy
                if (!string.IsNullOrEmpty(model.Password))
                    model.Password = SecurityHelper.Encrypt(model.Password);

                db.Settings.Add(model);
                TempData["Message"] = "SMTP ayarlarınız başarıyla oluşturuldu! 🚀";
            }
            else
            {
                // Güncelleme
                existingSetting.MailServer = model.MailServer;
                existingSetting.Port = model.Port;
                existingSetting.EnableSSL = model.EnableSSL;
                existingSetting.Email = model.Email;
                
                // 🔥 EĞER ŞİFRE ALANI DOLUYSA:
                // Kullanıcı yeni bir şifre yazmış demektir, onu şifrele ve öyle kaydet
                if (!string.IsNullOrEmpty(model.Password))
                {
                    existingSetting.Password = SecurityHelper.Encrypt(model.Password);
                }

                TempData["Message"] = "SMTP ayarlarınız başarıyla güncellendi! ✅";
            }

            db.SaveChanges();
        }

        return RedirectToAction("Index");
    }
}