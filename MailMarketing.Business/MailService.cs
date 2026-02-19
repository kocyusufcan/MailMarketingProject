using System.Net;
using System.Net.Mail;
using MailMarketing.Entity;
using MailMarketing.DataAccess;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration; 
using System.IO; 
using MailMarketing.Business; 
using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks; 

namespace MailMarketing.Business;

public class MailService
{
    // 1. TOPLU MAİL GÖNDERİMİ
    public string SendBulkMail(int templateId, int[] subscriberIds, int currentUserId)
    {
        var builder = new ConfigurationBuilder()
            .SetBasePath(Directory.GetCurrentDirectory())
            .AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
        IConfiguration config = builder.Build();
        string baseUrl = config["SiteSettings:BaseUrl"] ?? "http://localhost:5205";

        Template? template = null;
        List<Subscriber> subscribers = new List<Subscriber>();
        Setting? smtpSettings = null;
        User? senderUser = null;

        using (var db = new MailMarketingContext())
        {
            template = db.Templates.Find(templateId);
            subscribers = db.Subscribers.Where(s => subscriberIds.Contains(s.Id)).ToList();
            smtpSettings = db.Settings.FirstOrDefault(s => s.UserId == currentUserId);
            senderUser = db.Users.Find(currentUserId);

            if (template == null) return "Hata: Şablon bulunamadı!";
            if (!subscribers.Any()) return "Hata: Gönderilecek abone seçilmedi!";
            if (smtpSettings == null || string.IsNullOrEmpty(smtpSettings.Email)) return "Hata: SMTP bilgileriniz eksik!";
        }

        Task.Run(() => 
        {
            SendMailBackgroundTask(template, subscribers, smtpSettings, senderUser, baseUrl);
        });

        return "OK";
    }

    private void SendMailBackgroundTask(Template template, List<Subscriber> subscribers, Setting smtpSettings, User? senderUser, string baseUrl)
    {
        string decryptedPassword = "";
        try { decryptedPassword = SecurityHelper.Decrypt(smtpSettings.Password ?? "").Trim(); } 
        catch { decryptedPassword = smtpSettings.Password ?? ""; }

        string smtpEmail = smtpSettings.Email.Trim();
        string smtpHost = smtpSettings.MailServer ?? "smtp.gmail.com";
        int smtpPort = smtpSettings.Port > 0 ? smtpSettings.Port : 587;
        bool enableSsl = smtpSettings.EnableSSL;

        string senderDisplayName = !string.IsNullOrEmpty(senderUser?.DisplayName) 
                                    ? senderUser.DisplayName 
                                    : $"{senderUser?.FirstName} {senderUser?.LastName}".Trim();

        using (var db = new MailMarketingContext()) 
        {
            try
            {
                using (var client = new SmtpClient())
                {
                    client.Host = smtpHost; client.Port = smtpPort;
                    client.UseDefaultCredentials = false; 
                    client.Credentials = new NetworkCredential(smtpEmail, decryptedPassword);
                    client.EnableSsl = enableSsl;
                    client.DeliveryMethod = SmtpDeliveryMethod.Network;
                    client.Timeout = 20000; 

                    foreach (var sub in subscribers)
                    {
                        if (string.IsNullOrEmpty(sub.Email) || !sub.IsActive) continue; 

                        var log = new MailLog { SubscriberId = sub.Id, TemplateId = template.Id, SentDate = DateTime.Now };

                        try 
                        {
                            var mail = new MailMessage();
                            mail.From = new MailAddress(smtpEmail, senderDisplayName);
                            mail.To.Add(sub.Email.Trim()); 
                            mail.Subject = template.Title;
                            
                            string fullDisplayName = $"{sub.FirstName} {sub.LastName}".Trim();
                            string mainContent = template.Content?.Replace("[AdSoyad]", fullDisplayName)
                                                                 .Replace("{Name}", sub.FirstName ?? "") ?? "";

                            string unsubscribeUrl = $"{baseUrl}/Home/Unsubscribe?email={sub.Email}&token={sub.Id}";
                            
                            string footerHtml = $@"
                                <div style='clear:both; display:block; height:20px; width:100%;'></div>
                                <hr style='border:none;border-top:1px solid #e2e8f0;margin:20px 0;'>
                                <div style='text-align:center;font-family:sans-serif;color:#64748b;font-size:12px;line-height:1.6;'>
                                    <p style='margin-bottom:10px;'>Bu e-posta <strong>{senderDisplayName}</strong> tarafından gönderilmiştir.</p>
                                    <p>Artık bu tarz iletiler almak istemiyorsanız <a href='{unsubscribeUrl}' style='color:#3b82f6;text-decoration:underline;'>buraya tıklayarak</a> abonelikten ayrılabilirsiniz.</p>
                                    <p style='font-size:11px;opacity:0.6;margin-top:15px;'>© {DateTime.Now.Year} {senderDisplayName} - Tüm hakları saklıdır.</p>
                                </div>";

                            mail.Body = mainContent + footerHtml;
                            mail.IsBodyHtml = true;

                            client.Send(mail);
                            log.IsSuccess = true; log.ErrorMessage = "İletildi";
                        }
                        catch (Exception ex)
                        {
                            log.IsSuccess = false;
                            log.ErrorMessage = ex.InnerException != null ? ex.InnerException.Message : ex.Message;
                        }
                        db.MailLogs.Add(log);
                    }
                    db.SaveChanges(); 
                }

                if (senderUser != null) {
                    var checker = new BounceCheckManager();
                    _ = checker.CheckBouncesForUserAsync(senderUser);
                }
            }
            catch { }
        }
    }

    public void SendSystemEmail(string to, string subject, string body)
    {
        var builder = new ConfigurationBuilder().SetBasePath(Directory.GetCurrentDirectory()).AddJsonFile("appsettings.json", optional: false, reloadOnChange: true);
        IConfiguration config = builder.Build();
        string systemEmail = config["SystemMail:Email"] ?? "";
        string systemPass = config["SystemMail:Password"] ?? "";
        string systemHost = config["SystemMail:Host"] ?? "smtp.gmail.com";
        int systemPort = 587;
        if(int.TryParse(config["SystemMail:Port"], out int p)) systemPort = p;
        bool enableSsl = true;
        if(bool.TryParse(config["SystemMail:EnableSSL"], out bool s)) enableSsl = s;
        if (string.IsNullOrEmpty(systemEmail) || string.IsNullOrEmpty(systemPass)) return; 
        try {
            using (var client = new SmtpClient()) {
                client.Host = systemHost; client.Port = systemPort; client.UseDefaultCredentials = false;
                client.Credentials = new NetworkCredential(systemEmail, systemPass); client.EnableSsl = enableSsl;
                client.DeliveryMethod = SmtpDeliveryMethod.Network; client.Timeout = 10000;
                var mail = new MailMessage { From = new MailAddress(systemEmail, "Sistem Yönetimi"), Subject = subject, Body = body, IsBodyHtml = true };
                mail.To.Add(to.Trim()); client.Send(mail);
            }
        } catch { }
    }

    public void SendActivationCode(string toEmail, string code)
    {
        string htmlBody = $@"<html><body style='font-family:sans-serif; text-align:center;'><h2>Doğrulama Kodun</h2><h1 style='color:#4f46e5; letter-spacing:5px;'>{code}</h1></body></html>";
        SendSystemEmail(toEmail, "🔐 Doğrulama Kodun: " + code, htmlBody);
    }

    public void SendSubscriberWelcomeMail(string toEmail, string subscriberName, string brandName)
    {
        string htmlBody = $@"<html><body style='font-family:sans-serif;'><h2>Hoş Geldin! 🎉</h2><p><strong>{brandName}</strong> bültenine başarıyla abone oldun.</p></body></html>";
        SendSystemEmail(toEmail, $"Hoş Geldin! | {brandName}", htmlBody);
    }

    public void SendEmailChangeCode(string toEmail, string code)
    {
        string htmlBody = $@"
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }}
                .container {{ padding: 40px 20px; text-align: center; }}
                .card {{ background-color: #ffffff; max-width: 480px; margin: 0 auto; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }}
                .header {{ background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%); padding: 40px 20px; color: #ffffff; }}
                .header h2 {{ margin: 0; font-size: 24px; font-weight: 800; }}
                .content {{ padding: 40px 30px; text-align: center; }}
                .text {{ color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }}
                .code-container {{ background-color: #f1f5f9; padding: 20px; border-radius: 16px; border: 2px dashed #cbd5e1; margin-bottom: 30px; }}
                .code {{ font-family: 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #1e293b; margin: 0; }}
                .footer {{ padding: 25px; background-color: #fcfcfd; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 13px; }}
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='card'>
                    <div class='header'><h2>🔐 Güvenlik Onayı</h2></div>
                    <div class='content'>
                        <p class='text'>E-posta adresinizi değiştirmek için talepte bulundunuz. Onay kodunuz:</p>
                        <div class='code-container'><p class='code'>{code}</p></div>
                    </div>
                    <div class='footer'>© {DateTime.Now.Year} MailMarketing</div>
                </div>
            </div>
        </body>
        </html>";
        SendSystemEmail(toEmail, "🔐 E-posta Değişikliği Onay Kodu: " + code, htmlBody);
    }

    // 🔥 6. ŞİFRE SIFIRLAMA İÇİN ŞIK DOĞRULAMA MAİLİ (YENİ EKLENDİ)
    public void SendForgotPasswordCode(string toEmail, string code)
    {
        string htmlBody = $@"
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ background-color: #f8fafc; font-family: 'Segoe UI', sans-serif; margin: 0; padding: 0; }}
                .container {{ padding: 40px 20px; text-align: center; }}
                .card {{ background-color: #ffffff; max-width: 480px; margin: 0 auto; border-radius: 24px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.05); border: 1px solid #e2e8f0; }}
                .header {{ background: linear-gradient(135deg, #ef4444 0%, #f87171 100%); padding: 40px 20px; color: #ffffff; }}
                .header h2 {{ margin: 0; font-size: 24px; font-weight: 800; }}
                .content {{ padding: 40px 30px; text-align: center; }}
                .text {{ color: #475569; font-size: 16px; line-height: 1.6; margin-bottom: 30px; }}
                .code-container {{ background-color: #fef2f2; padding: 20px; border-radius: 16px; border: 2px dashed #fecaca; margin-bottom: 30px; }}
                .code {{ font-family: 'Courier New', monospace; font-size: 32px; font-weight: 800; letter-spacing: 8px; color: #b91c1c; margin: 0; }}
                .footer {{ padding: 25px; background-color: #fcfcfd; border-top: 1px solid #f1f5f9; color: #94a3b8; font-size: 13px; }}
            </style>
        </head>
        <body>
            <div class='container'>
                <div class='card'>
                    <div class='header'><h2>Şifre Sıfırlama</h2></div>
                    <div class='content'>
                        <p class='text'>Hesabınızın şifresini sıfırlamak için bir talepte bulundunuz. Onay kodunuz:</p>
                        <div class='code-container'><p class='code'>{code}</p></div>
                        <p style='font-size:12px; color:#94a3b8;'>Bu kod 60 saniye boyunca geçerlidir.</p>
                    </div>
                    <div class='footer'>© {DateTime.Now.Year} MailMarketing Güvenlik Birimi</div>
                </div>
            </div>
        </body>
        </html>";

        SendSystemEmail(toEmail, "🔐 Şifre Sıfırlama Kodu: " + code, htmlBody);
    }
}