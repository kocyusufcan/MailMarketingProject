using MailMarketing.DataAccess;
using MailMarketing.Entity;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

namespace MailMarketing.Business;

public class SubscriberManager
{
    private readonly MailMarketingContext _context;

    public SubscriberManager()
    {
        _context = new MailMarketingContext();
    }

    public Subscriber? GetById(int id)
    {
        return _context.Subscribers.AsNoTracking().FirstOrDefault(s => s.Id == id);
    }

    // --- ABONE GÜNCELLEME ---
    public string Update(Subscriber subscriber)
    {
        var validationResult = ValidateSubscriber(subscriber);
        if (validationResult != "OK") return validationResult;

        var exists = _context.Subscribers.Any(s => s.Email == subscriber.Email 
                                                && s.UserId == subscriber.UserId 
                                                && s.Id != subscriber.Id);
        if (exists) return "Bu e-posta adresi başka bir abonenizde zaten kayıtlı!";

        try
        {
            _context.Entry(subscriber).State = EntityState.Modified;
            _context.SaveChanges();
            return "OK";
        }
        catch (Exception ex)
        {
            return "Güncelleme hatası: " + ex.Message;
        }
    }

    // --- ORTAK DOĞRULAMA ---
    private string ValidateSubscriber(Subscriber subscriber)
    {
        if (string.IsNullOrEmpty(subscriber.Email))
            return "Lütfen bir e-posta adresi giriniz!";

        var emailRegex = new Regex(@"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$");
        if (!emailRegex.IsMatch(subscriber.Email))
            return "Geçersiz e-posta formatı!";

        string[] blacklistedDomains = { "test.com", "example.com", "asd.com", "deneme.com", "sallama.com", "tempmail.com" };
        string emailDomain = subscriber.Email.Split('@').Last().ToLower();

        if (blacklistedDomains.Contains(emailDomain))
            return $"'{emailDomain}' uzantılı adresler güvenlik nedeniyle kabul edilmemektedir!";

        return "OK";
    }

    // --- ABONE EKLEME ---
    public string Add(Subscriber subscriber)
    {
        var validationResult = ValidateSubscriber(subscriber);
        if (validationResult != "OK") return validationResult;

        var existsInUserList = _context.Subscribers.Any(s => s.Email == subscriber.Email && s.UserId == subscriber.UserId);
        if (existsInUserList) return "Bu e-posta adresi zaten listenizde mevcut!";

        try
        {
            subscriber.CreatedDate = DateTime.Now;
            _context.Subscribers.Add(subscriber);
            _context.SaveChanges();

            // Abone kaydedilince "Tüm Aboneler" sistem klasörüne de otomatik ekle
            var systemGroup = _context.SubscriberGroups
                .FirstOrDefault(g => g.UserId == subscriber.UserId && g.IsSystem);
            if (systemGroup != null)
            {
                bool alreadyInGroup = _context.SubscriberGroupMembers
                    .Any(m => m.GroupId == systemGroup.Id && m.SubscriberId == subscriber.Id);
                if (!alreadyInGroup)
                {
                    _context.SubscriberGroupMembers.Add(new MailMarketing.Entity.SubscriberGroupMember
                    {
                        GroupId = systemGroup.Id,
                        SubscriberId = subscriber.Id
                    });
                    _context.SaveChanges();
                }
            }
            return "OK";
        }
        catch (Exception)
        {
            return "Veritabanı hatası!";
        }
    }

    // --- ABONE SİLME (SORUNU ÇÖZEN GÜNCELLEME) ---
    public string Delete(int id)
    {
        try
        {
            // Önce silinecek kaydı buluyoruz
            var subscriber = _context.Subscribers.Find(id);
            
            if (subscriber == null) return "Silinecek abone bulunamadı!";
            _context.Subscribers.Remove(subscriber);
            _context.SaveChanges(); 
            
            return "OK";
        }
        catch (Exception ex)
        {
            return "Silme işlemi sırasında hata oluştu: " + ex.Message;
        }
    }

    // --- TÜMÜNÜ GETİR (TAZE VERİ GARANTİSİ) ---
    public List<Subscriber> GetAll()
    {
        // AsNoTracking ekledik ki EF veriyi cache'den değil, her seferinde SQL'den taze taze çeksin
        return _context.Subscribers.AsNoTracking().ToList();
    }
}