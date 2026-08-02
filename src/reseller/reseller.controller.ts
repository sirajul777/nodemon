import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards
} from "@nestjs/common";
import { ResellerService, Reseller } from "./reseller.service";
import { AuthGuard } from "../auth/auth.guard";
import { PermissionsGuard } from "../auth/permissions.guard";
import { RequirePermission } from "../auth/permissions.decorator";

@Controller("api/resellers")
@UseGuards(AuthGuard)
@UseGuards(PermissionsGuard)
export class ResellerController {
  constructor(private readonly resellerService: ResellerService) {}

  @Get("/session/:session")
  @RequirePermission("manageVoucher")
  getAll(@Param("session") session: string) {
    return this.resellerService.getAll(session);
  }

  @Get(":id")
  @RequirePermission("manageVoucher")
  async getOne(@Param("id") id: string) {
    const r = await this.resellerService.getById(id);
    return r || { error: "Not found" };
  }

  @Post()
  @RequirePermission("manageReseller")
  save(@Body() body: Reseller) {
    return this.resellerService.save_reseller(body);
  }

  @Delete(":id")
  @RequirePermission("manageReseller")
  async delete(@Param("id") id: string) {
    return { success: await this.resellerService.delete(id) };
  }
}

