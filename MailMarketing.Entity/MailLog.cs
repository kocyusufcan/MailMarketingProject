using System;

namespace MailMarketing.Entity;

public class MailLog
{
    public int Id { get; set; }
    public DateTime SentDate { get; set; }
    public bool IsSuccess { get; set; }
    public int? SubscriberId { get; set; }
    public virtual Subscriber? Subscriber { get; set; } 

    public int? TemplateId { get; set; }
    public virtual Template? Template { get; set; }
    public string? ErrorMessage { get; set; }
}