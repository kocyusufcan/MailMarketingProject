namespace MailMarketing.Entity;

public class Template
{
    public int Id { get; set; }
    public string Title { get; set; } = string.Empty;
    public string Content { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTime CreatedDate { get; set; } = DateTime.Now;
    public int UserId { get; set; }
    public virtual User? User { get; set; }
}