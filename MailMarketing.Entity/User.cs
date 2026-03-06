using System.ComponentModel.DataAnnotations.Schema;

namespace MailMarketing.Entity;

public class User
{
    public int Id { get; set; }
    public string? FirstName { get; set; } = string.Empty;
    public string? LastName { get; set; } = string.Empty;
    
    public string? DisplayName { get; set; } = string.Empty; 

    public string? Email { get; set; } = string.Empty;
    public string? Password { get; set; } = string.Empty;
    public bool IsActive { get; set; } = true;
    public DateTime CreatedDate { get; set; } = DateTime.Now;

    public bool IsAdmin { get; set; } = false; 
    public bool IsPublic { get; set; } = false; 

    // ? BU ÝKÝSÝ BÝZÝM TÜM HÝYERARÞÝYÝ ÇÖZÜYOR
    public string? AdminInvitationCode { get; set; } 
    public int? ParentAdminId { get; set; }

    public string? SmtpEmail { get; set; }
    public string? SmtpPassword { get; set; } 
    public string? SmtpHost { get; set; } = "smtp.gmail.com";
    public int? SmtpPort { get; set; } = 587;

    [NotMapped] 
    public string Name => $"{FirstName} {LastName}".Trim(); 

    [NotMapped]
    public string BrandName 
    {
        get 
        {
            if (string.IsNullOrWhiteSpace(DisplayName)) return Name;
            return DisplayName;
        }
    }
}
// 
