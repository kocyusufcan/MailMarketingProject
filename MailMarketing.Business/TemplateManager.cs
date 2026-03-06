using MailMarketing.DataAccess;
using MailMarketing.Entity;

namespace MailMarketing.Business;

public class TemplateManager
{
    private readonly MailMarketingContext _context = new MailMarketingContext();

    public string Add(Template template)
    {
        if (string.IsNullOrEmpty(template.Title) || string.IsNullOrEmpty(template.Content))
            return "Başlık ve içerik boş olamaz!";

        // Aynı isimde şablon var mı kontrolü
        if (_context.Templates.Any(t => t.UserId == template.UserId && t.Title == template.Title))
            return "Bu isimde bir şablonunuz zaten var! Lütfen farklı bir isim kullanın.";

        template.CreatedDate = DateTime.Now;
        template.IsActive = true;
        
        _context.Templates.Add(template);
        _context.SaveChanges();
        LogManager.LogAction(template.UserId, "Yeni Şablon Eklendi", $"'{template.Title}' adlı yeni mail şablonu oluşturuldu.");
        return "OK";
    }

    public string Update(Template template)
    {
        if (string.IsNullOrEmpty(template.Title) || string.IsNullOrEmpty(template.Content))
            return "Başlık ve içerik boş olamaz!";

        // Başka bir şablonda bu isim var mı?
        if (_context.Templates.Any(t => t.UserId == template.UserId && t.Title == template.Title && t.Id != template.Id))
            return "Bu isimde başka bir şablonunuz zaten var! Lütfen farklı bir isim kullanın.";

        var existing = _context.Templates.FirstOrDefault(t => t.Id == template.Id);
        if (existing == null) return "Şablon bulunamadı!";

        existing.Title = template.Title;
        existing.Content = template.Content;
        // CreatedDate ve IsActive alanlarını ellemiyoruz, onlar sabit kalmalı.

        _context.SaveChanges();
        LogManager.LogAction(template.UserId, "Şablon Güncellendi", $"'{template.Title}' adlı mail şablonu güncellendi.");
        return "OK";
    }

    public List<Template> GetAll() => _context.Templates.ToList();
}