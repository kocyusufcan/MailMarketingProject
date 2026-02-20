using MailKit;
using MailKit.Net.Imap;
using MailKit.Search;
using MailKit.Security;
using MailMarketing.DataAccess;
using MailMarketing.Entity;
using System.Text.RegularExpressions;
using System;
using System.Linq;
using System.Threading.Tasks;
using MailMarketing.Business;

namespace MailMarketing.Business;

public class BounceCheckManager
{
    public async Task CheckBouncesForUserAsync(User user)
    {
        using (var db = new MailMarketingContext())
        {
            // 1. Ayarları Settings tablosundan çekiyoruz
            var settings = db.Settings.FirstOrDefault(s => s.UserId == user.Id);
            
            if (settings == null || string.IsNullOrEmpty(settings.Email) || string.IsNullOrEmpty(settings.Password))
                return;

            try
            {
                // 2. Şifreyi çöz
                string decryptedPassword = "";
                try {
                    decryptedPassword = SecurityHelper.Decrypt(settings.Password ?? "").Trim();
                } catch {
                    decryptedPassword = settings.Password ?? "";
                }

                // 3. Sunucuyu dinamik yap (SMTP -> IMAP Çevirisi ve Fallback)
                string smtpHost = settings.MailServer ?? "smtp.gmail.com";
                string[] prefixes = { "imap.", "mail.", "" }; // "" -> direkt smtp.site.com
                string baseHost = smtpHost.StartsWith("smtp.") ? smtpHost.Substring(5) : smtpHost;
                
                bool connected = false;
                Exception? lastException = null;

                using (var client = new ImapClient())
                {
                    client.Timeout = 15000;
                    // Sertifika hatalarını es geç (Self-signed vs.)
                    client.CheckCertificateRevocation = false;

                    foreach (var prefix in prefixes)
                    {
                        try
                        {
                            string tryHost = prefix + baseHost;
                            // Eğer prefix boşsa ve baseHost zaten smtp. ile başlamıyorsa, direkt baseHost'u dene
                            if (string.IsNullOrEmpty(prefix) && !baseHost.Contains(".")) tryHost = smtpHost; 

                            await client.ConnectAsync(tryHost, 993, SecureSocketOptions.SslOnConnect);
                            connected = true;
                            // Console.WriteLine($"[Bounce] Bağlandı: {tryHost}");
                            break;
                        }
                        catch (Exception ex)
                        {
                            lastException = ex;
                            // Console.WriteLine($"[Bounce] Başarısız: {prefix + baseHost} - {ex.Message}");
                        }
                    }

                    if (!connected)
                    {
                         // Hiçbiri çalışmadıysa, son hatayı fırlat veya logla
                         Console.WriteLine($"[BounceManager Hata] Kullanıcı ID: {user.Id} - Bağlantı kurulamadı. Son Hata: {lastException?.Message}");
                         return;
                    }

                    // Giriş yap
                    await client.AuthenticateAsync(settings.Email, decryptedPassword);

                    var inbox = client.Inbox;
                    await inbox.OpenAsync(FolderAccess.ReadWrite);

                    // 4. HATA MAİLLERİNİ ARA (Genişletilmiş Filtre)
                    var timeLimit = DateTime.Now.AddDays(-1);
                    var query = SearchQuery.DeliveredAfter(timeLimit).And(
                        SearchQuery.SubjectContains("Notification")
                        .Or(SearchQuery.SubjectContains("Failure"))
                        .Or(SearchQuery.SubjectContains("Undeliverable"))
                        .Or(SearchQuery.SubjectContains("İletilemedi"))
                        .Or(SearchQuery.SubjectContains("Hata"))
                        .Or(SearchQuery.FromContains("postmaster"))
                        .Or(SearchQuery.FromContains("mailer-daemon"))
                    );

                    var uids = await inbox.SearchAsync(query);

                    if (uids.Count > 0)
                    {
                        bool anyChange = false;

                        foreach (var uid in uids)
                        {
                            var message = await inbox.GetMessageAsync(uid);
                            string body = message.TextBody ?? message.HtmlBody ?? "";

                            // E-posta adreslerini yakala
                            var matches = Regex.Matches(body, @"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}");

                            foreach (Match match in matches)
                            {
                                string foundEmail = match.Value.ToLower().Trim();
                                
                                // Kendi mailimizi veya sistem maillerini atla
                                if (foundEmail.Contains(settings.Email.ToLower()) || 
                                    foundEmail.Contains("google.com") || 
                                    foundEmail.Contains("microsoft.com")) continue;

                                // Sadece bu kullanıcıya ait aktif aboneyi bul
                                // s.Email != null kontrolü ekleyerek CS8602 uyarısını çözüyoruz
                                var subscriber = db.Subscribers.FirstOrDefault(s => 
                                s.Email != null && 
                                s.Email.ToLower() == foundEmail && 
                                s.UserId == user.Id && 
                                    s.IsActive == true);

                                if (subscriber != null)
                                {
                                    subscriber.IsActive = false; // ABONEYİ DURDUR
                                    
                                    // Mail logunu güncelle
                                    var lastLog = db.MailLogs
                                        .Where(l => l.SubscriberId == subscriber.Id)
                                        .OrderByDescending(l => l.Id)
                                        .FirstOrDefault();

                                    if (lastLog != null) 
                                    { 
                                        lastLog.IsSuccess = false; 
                                        lastLog.ErrorMessage = "İletim Hatası: Böyle bir kullanıcı bulunamadı"; 
                                    }

                                    // Bildirim ekle
                                    db.Notifications.Add(new Notification
                                    {
                                        Title = "İletim Hatası",
                                        // FirstName ve LastName null ise boşluk bırak (?? "")
                                        Message = $"{(subscriber.FirstName ?? "")} {(subscriber.LastName ?? "")} ({subscriber.Email}) maili geri döndü ve pasife alındı.",
                                        CreatedAt = DateTime.Now,
                                        IsRead = false,
                                        UserId = user.Id 
                                    });

                                    anyChange = true;
                                    Console.WriteLine($"[BOUNCE] Yakalandı: {foundEmail}");
                                }
                                // ... (Alt kısımlar aynı)
                            }
                            // İşlenen maili silinmek üzere işaretle (Gmail'de temiz kalsın)
                            await inbox.AddFlagsAsync(uid, MessageFlags.Deleted, true);
                        }
                        
                        if (anyChange) await db.SaveChangesAsync();
                        // Silme işlemini onayla
                        await inbox.ExpungeAsync();
                    }
                    await client.DisconnectAsync(true);
                }
            }
            catch (Exception ex)
            {
                // Bounce kontrolü kritik bir akış olmadığı için sadece konsola yazıyoruz
                Console.WriteLine($"[BounceManager Hata] Kullanıcı ID: {user.Id} - Hata: {ex.ToString()}");
            }
        }
    }
}