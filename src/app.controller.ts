import { Controller, Get, Render, UseGuards } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  @Render("index") // This looks for views/index.eta
  async getDashboard() {
    // You can fetch real data here to display in your 8,000 lines
    return {
      title: "NODEMON - Dashboard",
      username: "Admin",
      userInitials: "A",
      pageTitle: "Dashboard Utama",
      // Example data for your stats
      revenueToday: "Rp 1.250.000",
      activeUsers: 42
    };
  }
}
