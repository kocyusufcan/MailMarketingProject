namespace MailMarketing.Entity;

public class Setting
{
    public int Id { get; set; }
    public string MailServer { get; set; } = string.Empty;
    public int Port { get; set; }
    public bool EnableSSL { get; set; }
    public string Email { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public int UserId { get; set; } 
}