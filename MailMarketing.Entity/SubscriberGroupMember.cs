namespace MailMarketing.Entity;

public class SubscriberGroupMember
{
    public int Id { get; set; }
    public int GroupId { get; set; }
    public int SubscriberId { get; set; }

    public virtual SubscriberGroup? Group { get; set; }
    public virtual Subscriber? Subscriber { get; set; }
}