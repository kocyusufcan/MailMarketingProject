namespace MailMarketing.Entity
{
    public class Notification
    {
        public int Id { get; set; }
        
        public string Title { get; set; } = string.Empty; 
        
        public string Message { get; set; } = string.Empty; 

        public DateTime CreatedAt { get; set; } = DateTime.Now;
        public bool IsRead { get; set; } = false;

        //Bildirimin hangi kullanıcıya ait olduğunu tutar.
        // Bu satır CS1061 hatasını çözer.
        public int UserId { get; set; } 
    }
}