using MailMarketing.DataAccess;
using MailMarketing.Entity;
using System.Linq;

namespace MailMarketing.Business;

public class SettingManager
{
    private readonly MailMarketingContext _context = new MailMarketingContext();

    public Setting? GetSettings()
    {
        try 
        {
            // Veritabanında satır varsa getir, yoksa hata alma
            return _context.Settings.FirstOrDefault();
        }
        catch 
        {
            // Eğer veritabanındaki veri bozuksa (NULL hatası veriyorsa) 
            // hiçbir şey getirme, yeni kayıt oluşturmaya zorla.
            return null; 
        }
    }

    public string SaveSettings(Setting setting)
    {
        // 1. Önce içeride ne kadar eski/bozuk kayıt varsa temizle
        var existingData = _context.Settings.ToList();
        _context.Settings.RemoveRange(existingData);
        _context.SaveChanges();

        // 2. Senin formdan gelen temiz veriyi ekle
        _context.Settings.Add(setting);
        _context.SaveChanges();

        return "OK";
    }
}