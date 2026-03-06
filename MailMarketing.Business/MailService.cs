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
    // 1. Toplu Mail Gönderimi
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
                            string technicalError = ex.InnerException != null ? ex.InnerException.Message : ex.Message;
                            log.ErrorMessage = MailErrorHelper.GetFriendlyMessage(technicalError);
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
            catch (Exception ex)
            {
                // SMTP Bağlantı hatası veya genel bir hata olduğunda tüm aboneler için hata logu oluştur
                string technicalError = ex.InnerException != null ? ex.InnerException.Message : ex.Message;
                string friendlyError = MailErrorHelper.GetFriendlyMessage(technicalError);

                foreach (var sub in subscribers)
                {
                    var log = new MailLog { 
                        SubscriberId = sub.Id, 
                        TemplateId = template.Id, 
                        SentDate = DateTime.Now,
                        IsSuccess = false,
                        ErrorMessage = "Bağlantı Hatası: " + friendlyError
                    };
                    db.MailLogs.Add(log);
                }
                db.SaveChanges();
            }
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
        string htmlBody = $@"
<!DOCTYPE html>
<html lang='tr'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>E-posta Doğrulama</title>
</head>
<body style='margin:0; padding:0; background-color:#f4f6fb; font-family: Arial, Helvetica, sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='background-color:#f4f6fb; padding: 40px 0;'>
    <tr>
      <td align='center'>
        <table width='520' cellpadding='0' cellspacing='0' style='background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);'>

          <!-- Header -->
          <tr>
            <td style='background: linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%); padding: 36px 40px; text-align:center;'>
              <h1 style='margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.5px;'>Mail Marketing</h1>
              <p style='margin:6px 0 0; color:rgba(255,255,255,0.8); font-size:13px;'>E-posta Doğrulama</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style='padding: 40px 48px 32px;'>
              <p style='margin:0 0 8px; color:#111827; font-size:17px; font-weight:600;'>Hesabınızı doğrulayın</p>
              <p style='margin:0 0 28px; color:#6b7280; font-size:14px; line-height:1.6;'>
                Kaydınızı tamamlamak için aşağıdaki 6 haneli doğrulama kodunu girin.<br/>
                Bu kod <strong>60 saniye</strong> geçerlidir.
              </p>

              <!-- Code Box -->
              <div style='background-color:#f0f0ff; border: 2px dashed #6366f1; border-radius:10px; padding: 24px 16px; text-align:center; margin-bottom:28px;'>
                <p style='margin:0 0 6px; color:#6b7280; font-size:12px; text-transform:uppercase; letter-spacing:1px;'>Doğrulama Kodunuz</p>
                <p style='margin:0; font-size:42px; font-weight:700; letter-spacing:12px; color:#4f46e5; font-family: monospace;'>{code}</p>
              </div>

              <p style='margin:0; color:#9ca3af; font-size:12px; line-height:1.6;'>
                Bu e-postayı siz istemediyseniz güvenle görmezden gelebilirsiniz.<br/>
                Hesabınızı başka biri oluşturmaya çalışıyor olabilir.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style='background-color:#f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 48px; text-align:center;'>
              <p style='margin:0; color:#9ca3af; font-size:12px;'>
                &copy; {DateTime.Now.Year} Mail Marketing &mdash; Bu mesaj otomatik olarak oluşturulmuştur.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
        SendSystemEmail(toEmail, "Doğrulama Kodu: " + code, htmlBody);
    }

    public void SendSubscriberWelcomeMail(string toEmail, string subscriberName, string brandName)
    {
        string displayName = string.IsNullOrWhiteSpace(subscriberName) ? "Değerli Abone" : subscriberName;
        string htmlBody = $@"
<!DOCTYPE html>
<html lang='tr'>
<head>
  <meta charset='UTF-8' />
  <meta name='viewport' content='width=device-width, initial-scale=1.0' />
  <title>Hoş Geldiniz</title>
</head>
<body style='margin:0; padding:0; background-color:#f0fdf4; font-family: Arial, Helvetica, sans-serif;'>
  <table width='100%' cellpadding='0' cellspacing='0' style='background-color:#f0fdf4; padding: 40px 0;'>
    <tr>
      <td align='center'>
        <table width='520' cellpadding='0' cellspacing='0' style='background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08);'>

          <!-- Header -->
          <tr>
            <td style='background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); padding: 36px 40px; text-align:center;'>
              <h1 style='margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.5px;'>{brandName}</h1>
              <p style='margin:6px 0 0; color:rgba(255,255,255,0.85); font-size:13px;'>Bültene Hoş Geldiniz</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style='padding: 40px 48px 32px;'>
              <p style='margin:0 0 8px; color:#111827; font-size:17px; font-weight:600;'>Merhaba, {displayName}!</p>
              <p style='margin:0 0 28px; color:#6b7280; font-size:14px; line-height:1.6;'>
                <strong>{brandName}</strong> bültenine başarıyla abone oldunuz.<br/>
                Bundan böyle en güncel içerikler, haberler ve kampanyalar doğrudan size ulaşacak.
              </p>

              <!-- Info Box -->
              <div style='background-color:#f0fdf4; border-left: 4px solid #16a34a; border-radius:6px; padding: 18px 20px; margin-bottom:28px;'>
                <p style='margin:0; color:#166534; font-size:14px; line-height:1.6;'>
                  Aboneliğinizi yönetmek veya iptal etmek için aldığınız e-postalardaki bağlantıyı kullanabilirsiniz.
                </p>
              </div>

              <p style='margin:0; color:#9ca3af; font-size:12px; line-height:1.6;'>
                Bu e-postayı siz istemediyseniz güvenle görmezden gelebilirsiniz.<br/>
                Herhangi bir işlem yapmanıza gerek yoktur.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style='background-color:#f9fafb; border-top: 1px solid #e5e7eb; padding: 20px 48px; text-align:center;'>
              <p style='margin:0; color:#9ca3af; font-size:12px;'>
                &copy; {DateTime.Now.Year} {brandName} &mdash; Bu mesaj otomatik olarak oluşturulmuştur.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>";
        SendSystemEmail(toEmail, $"Hoş Geldiniz! | {brandName}", htmlBody);
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
                    <div class='header'><h2>Güvenlik Onayı</h2></div>
                    <div class='content'>
                        <p class='text'>E-posta adresinizi değiştirmek için talepte bulundunuz. Onay kodunuz:</p>
                        <div class='code-container'><p class='code'>{code}</p></div>
                    </div>
                    <div class='footer'>© {DateTime.Now.Year} MailMarketing</div>
                </div>
            </div>
        </body>
        </html>";
        SendSystemEmail(toEmail, "E-posta Değişikliği Onay Kodu: " + code, htmlBody);
    }

    // 6. Şifre sıfırlama için doğrulama maili gönderimi
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

        SendSystemEmail(toEmail, "Şifre Sıfırlama Kodu: " + code, htmlBody);
    }
}