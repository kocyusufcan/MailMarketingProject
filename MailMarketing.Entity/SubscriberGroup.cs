namespace MailMarketing.Entity;

public class SubscriberGroup
{
    public int Id { get; set; }
    public string GroupName { get; set; } = null!;
    public int UserId { get; set; }
    public DateTime CreatedAt { get; set; }

    // İlişkiler
    public virtual User? User { get; set; }
    public virtual ICollection<SubscriberGroupMember> Members { get; set; } = new List<SubscriberGroupMember>();
}