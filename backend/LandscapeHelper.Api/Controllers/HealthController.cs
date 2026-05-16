using Microsoft.AspNetCore.Mvc;

namespace LandscapeHelper.Api.Controllers;

[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        return Ok("API Running");
    }
}
