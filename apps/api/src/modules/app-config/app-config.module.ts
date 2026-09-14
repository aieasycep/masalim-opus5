import { Module } from '@nestjs/common';
import { ChildrenModule } from '../children/children.module';
import { StoriesModule } from '../stories/stories.module';
import { AppConfigController } from './app-config.controller';
import { AppConfigModuleService } from './app-config.service';
import { HomeService } from './home.service';

@Module({
  imports: [ChildrenModule, StoriesModule],
  controllers: [AppConfigController],
  providers: [AppConfigModuleService, HomeService],
  exports: [AppConfigModuleService],
})
export class AppConfigFeatureModule {}
