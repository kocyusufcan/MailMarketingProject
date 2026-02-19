namespace MailMarketing.Entity;

public class ActivityLog
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string? ActionTitle { get; set; }
    public string? ActionDetail { get; set; }
    public DateTime CreatedAt { get; set; }

    // İlişki 
    public virtual User? User { get; set; }
}