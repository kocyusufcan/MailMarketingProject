using System.Net;
using System.Net.Mail;
using MailMarketing.Entity; // SMTP modeline ulaşmak için bunu ekledik

namespace MailMarketing.API.Services;

public class EmailService
{
    // 🔥 GÜNCELLEME: Orijinal 'Setting' modelini kullanıyoruz
    public async Task<bool> SendEmailAsync(string toEmail, string subject, string body, Setting smtp)
    {
        try
        {
            // Veritabanından gelen MailServer ve Port bilgilerini kullanıyoruz
            var client = new SmtpClient(smtp.MailServer, smtp.Port)
            {
                EnableSsl = smtp.EnableSSL, // Veritabanındaki ayarı kullan
                Credentials = new NetworkCredential(smtp.Email, smtp.Password)
            };

            var mailMessage = new MailMessage
            {
                // Gönderen kısmına kullanıcının kendi mailini yazıyoruz
                From = new MailAddress(smtp.Email, "Mail Marketing"),
                Subject = subject,
                Body = body,
                IsBodyHtml = true 
            };

            mailMessage.To.Add(toEmail);

            await client.SendMailAsync(mailMessage);
            return true;
        }
        catch (Exception ex)
        {
            // Hatayı fırlatıyoruz ki Controller yakalayıp loglayabilsin
            Console.WriteLine($"Mail gönderim hatası ({toEmail}): {ex.Message}");
            throw; 
        }
    }
}