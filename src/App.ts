import { Logger } from "winston";
import {ServiceConfigs} from "./configs/ServiceConfigs";
import {TaskService} from "./services/TaskService";
const cron=require('node-cron')
export class App {
    private logger: Logger;
    private configs: ServiceConfigs
    constructor(logger: Logger,configs:ServiceConfigs) {
        this.logger = logger;
        this.configs=configs

    }

    public main() {
        this.logger.info("程序启动中...")
        let task = new TaskService(this.configs,this.logger);
        task.task();
        cron.schedule(this.configs.CRON,()=>{
            task.task();
        }).start()
        this.logger.info("程序启动成功！")
    }
}
