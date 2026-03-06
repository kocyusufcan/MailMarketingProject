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
    public async Task<int> CheckBouncesForUserAsync(User user)
    {
        using (var db = new MailMarketingContext())
        {
            // 1. Ayarları Settings tablosundan çekiyoruz
            var settings = db.Settings.FirstOrDefault(s => s.UserId == user.Id);
            
            if (settings == null || string.IsNullOrEmpty(settings.Email) || string.IsNullOrEmpty(settings.Password))
                return 0;

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
                         return 0;
                    }

                    // Giriş yap
                    await client.AuthenticateAsync(settings.Email, decryptedPassword);

                    // 4. Klasörleri Tara (Inbox ve Trash)
                    var foldersToScan = new List<IMailFolder> { client.Inbox };
                    
                    var trash = client.GetFolder(SpecialFolder.Trash);
                    if (trash != null) foldersToScan.Add(trash);

                    foreach (var folder in foldersToScan)
                    {
                        await folder.OpenAsync(FolderAccess.ReadWrite);

                        // 5. HATA MAİLLERİNİ ARA (Genişletilmiş Filtre)
                        var timeLimit = DateTime.Now.AddDays(-3); // Son 3 günü tara
                        var query = SearchQuery.DeliveredAfter(timeLimit).And(
                            SearchQuery.SubjectContains("Notification")
                            .Or(SearchQuery.SubjectContains("Failure"))
                            .Or(SearchQuery.SubjectContains("Undeliverable"))
                            .Or(SearchQuery.SubjectContains("İletilemedi"))
                            .Or(SearchQuery.SubjectContains("Hata"))
                            .Or(SearchQuery.SubjectContains("Mail Delivery"))
                            .Or(SearchQuery.SubjectContains("Returned"))
                            .Or(SearchQuery.SubjectContains("Unreachable"))
                            .Or(SearchQuery.FromContains("postmaster"))
                            .Or(SearchQuery.FromContains("mailer-daemon"))
                        );

                        var uids = await folder.SearchAsync(query);

                        if (uids.Count > 0)
                        {
                            int changedCount = 0;

                            // Kullanıcının tüm abonelerini bir kez çek (performans için döngü dışında)
                            var allSubscribers = db.Subscribers.Where(s => s.UserId == user.Id).ToList();
                            var idn = new System.Globalization.IdnMapping();

                            foreach (var uid in uids)
                            {
                                try
                                {
                                    var message = await folder.GetMessageAsync(uid);
                                    string bodyText = message.TextBody ?? "";
                                    string htmlText = message.HtmlBody ?? "";
                                    string subject = message.Subject ?? "";
                                    
                                    string fullText = (subject + " " + bodyText + " " + htmlText).ToLower();

                                    bool matchedAnySubscriber = false;

                                    foreach (var sub in allSubscribers)
                                    {
                                        if (string.IsNullOrEmpty(sub.Email)) continue;

                                        string subEmailLower = sub.Email.ToLower().Trim();
                                        string punycodeEmail = subEmailLower;

                                        try 
                                        {
                                            var parts = subEmailLower.Split('@');
                                            if (parts.Length == 2) 
                                            {
                                                punycodeEmail = parts[0] + "@" + idn.GetAscii(parts[1]).ToLower();
                                            }
                                        } 
                                        catch { }

                                        // Bounce mailinde normal halini veya punycode halini bulduk mu?
                                        if (fullText.Contains(subEmailLower) || (punycodeEmail != subEmailLower && fullText.Contains(punycodeEmail)))
                                        {
                                            sub.IsActive = false; // ABONEYİ DURDUR
                                            changedCount++;
                                            
                                            var lastLog = db.MailLogs
                                                .Where(l => l.SubscriberId == sub.Id)
                                                .OrderByDescending(l => l.Id)
                                                .FirstOrDefault();

                                            if (lastLog != null) 
                                            { 
                                                lastLog.IsSuccess = false; 
                                                lastLog.ErrorMessage = "İletim Hatası: Alıcı adresi bulunamadı veya kabul edilmedi (Bounce)"; 
                                            }

                                            db.Notifications.Add(new Notification
                                            {
                                                Title = "İletim Hatası (Bounce)",
                                                Message = $"{(sub.FirstName ?? "")} {(sub.LastName ?? "")} ({sub.Email}) adresine gönderilen mail geri döndü ve abone pasife alındı.",
                                                CreatedAt = DateTime.Now,
                                                IsRead = false,
                                                UserId = user.Id 
                                            });

                                            matchedAnySubscriber = true;
                                        }
                                    }

                                    // Tespit ettiğimiz bir bounce varsa hemen kaydet
                                    if (matchedAnySubscriber)
                                    {
                                        await db.SaveChangesAsync();
                                        
                                        try
                                        {
                                            await folder.AddFlagsAsync(uid, MessageFlags.Deleted, true);
                                        }
                                        catch (Exception flagEx)
                                        {
                                            Console.WriteLine($"[BounceManager] Mesaj işaretlenirken hata (önemsiz): {flagEx.Message}");
                                        }
                                    }
                                }
                                catch (Exception uidEx)
                                {
                                    // Tek bir bounce maili okunamazsa diğerlerine devam et
                                    Console.WriteLine($"[BounceManager] Bounce maili işlenirken hata (devam ediliyor): {uidEx.Message}");
                                }
                            }

                            // Son olarak expunge yap (silinmiş mesajları temizle)
                            try { await folder.ExpungeAsync(); } catch { }
                            return changedCount;
                        }
                    }
                    await client.DisconnectAsync(true);
                    return 0;
                }
            }
            catch (Exception ex)
            {
                // Bounce kontrolü kritik bir akış olmadığı için sadece konsola yazıyoruz
                Console.WriteLine($"[BounceManager Hata] Kullanıcı ID: {user.Id} - Hata: {ex.ToString()}");
                return 0;
            }
        }
    }
}