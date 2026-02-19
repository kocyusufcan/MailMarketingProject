namespace MailMarketing.Entity;

public class Subscriber
{
    public int Id { get; set; }
    public string? FirstName { get; set; }
    public string? LastName { get; set; }
    public string? Email { get; set; }
    public bool IsActive { get; set; }
    
    public int UserId { get; set; } 

    public DateTime CreatedDate { get; set; } = DateTime.Now;
    
    // İlişkiyi C# tarafında (Navigation Property) yönetmek için
    public virtual User? User { get; set; }
}