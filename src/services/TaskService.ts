import {ServiceConfigs} from "../configs/ServiceConfigs";
import path from "path";
import {Logger, loggers} from "winston";
import {spawn} from "child_process";

import {FileUtils} from "../utils/FileUtils";
const fs = require('fs/promises');
const  ikuai=require('ikuai')
export class TaskService {
    private configs:ServiceConfigs
    private logger:Logger
    private  script:string=''
    private START_MARKER:string='###BEGIN cloudflareSpeedtest-local###'
    private END_MARKER:string='###END cloudflareSpeedtest-local###'


    constructor(configs:ServiceConfigs,logger:Logger) {
        this.logger=logger
        this.configs=configs
        if (process.platform === 'win32') {
            this.logger.info('Running on Windows');
            this.script=this.configs.SCRIPT_WIN
            // 针对 Windows 的处理
        } else if (process.platform === 'linux') {
            this.logger.info('Running on Linux');
            this.script=this.configs.SCRIPT_LINUX
            // 针对 Linux 的处理
        }
    }
    private  execSpeedTest(workdir:string,param:Array<any>):Promise<any>{
        this.logger.debug("param:"+param+",workdir:"+workdir+",scrpitName:"+this.script)
        return new Promise((resolve, reject) => {
            // 启动 CloudflareST
            const child = spawn('./'+this.script, param,{
                cwd: workdir,  // 工作目录指定
                stdio: 'ignore'  // 标准输出
            });
            // 捕获进程结束
            child.on('close', async (code) => {
                this.logger.info(`CloudflareST 退出，退出码：${code}`);
                resolve('ok')
            });
        })
    }

    private async  update2Local(ip:Array<string> , ip6:Array<string> , domain_set:Array<string>){
        const hostsPath = this.configs.HOSTS_FILE;
        const START_MARKER:string=''
        const END_MARKER:string=''
        // 读取现有 hosts
        let content = await fs.readFile(hostsPath, 'utf8');
        this.logger.debug("hosts内容：")
        this.logger.debug(content)

        // 生成管理块
        const managedBlock = this.buildManagedBlock(ip,ip6,domain_set);

        const startIndex = content.indexOf(this.START_MARKER);
        const endIndex = content.indexOf(this.END_MARKER);
        if (
            startIndex !== -1 &&
            endIndex !== -1 &&
            endIndex > startIndex
        ) {
            // 替换已有区域
            content =
                content.slice(0, startIndex) +
                managedBlock +
                content.slice(endIndex ,endIndex+ END_MARKER.length);
        } else {
            // 追加到末尾
            content =
                content.trimEnd() +
                '\n\n' +
                managedBlock +
                '\n';
        }

       /* // 备份
        await fs.copyFile(
            hostsPath,
            `${hostsPath}.bak`
        );*/

        // 写回
        await fs.writeFile(
            hostsPath,
            content,
            'utf8'
        );
    }

    private buildManagedBlock(ip: Array<string>,ip6: Array<string>, domain_set: Array<string>) {
        const fastIp=ip[0];
        const lines = domain_set.map(
            domain => `${fastIp} ${domain}`
        );
       if (ip6!==null&&ip6.length>0) {
           const fastIp6=ip6[0]
           let lines6 = domain_set.map(
               domain => `${fastIp6} ${domain}`
           );
           lines.push(...lines6)
       }
        return [
            this.START_MARKER,
            ...lines,
            this.END_MARKER
        ].join('\n');
    }

    public async task() {
        this.logger.info("开始执行任务！")
        let domain=FileUtils.loadDomainList('./configs/domain.txt');
        this.logger.info("需要更新的域名"+JSON.stringify(domain))
        if (this.script == null || this.script == '') {
            this.logger.error("系统不支持，请使用win32或者linux")
            return
        }
        const option = []
        if (this.configs.DN != null && this.configs.DN > 0) {
            option.push('-dn', this.configs.DN)
        }
        if (this.configs.TL != null && this.configs.TL > 0) {
            option.push('-tl', this.configs.TL)
        }
        if (this.configs.TLL != null && this.configs.TLL > 0) {
            option.push('-tll', this.configs.TLL)
        }
        if (this.configs.TLR != null && this.configs.TLR > 0) {
            option.push('-tlr', this.configs.TLR)
        }
        if (this.configs.SL != null && this.configs.SL > 0) {
            option.push('-sl', this.configs.SL)
        }
       //附加参数
        if (this.configs.DT != null && this.configs.DT > 0) {
            option.push('-dt', this.configs.DT)
        }
        if (this.configs.DD) {
            option.push('-dd')
        }
        if (this.configs.HTTPING) {
            option.push('-httping')
        }
        if (this.configs.HTTPING_CODE != null && this.configs.HTTPING_CODE > 0) {
            option.push('-httping-code', this.configs.HTTPING_CODE)
        }
        if (this.configs.ALLIP) {
            option.push('-allip')
        }
        if (this.configs.CF_COLO != null && this.configs.CF_COLO!='') {
            option.push('-cfcolo', this.configs.CF_COLO)
        }
        if (this.configs.N != null && this.configs.N > 0) {
            option.push('-n', this.configs.N)
        }
        if (this.configs.T != null && this.configs.T > 0) {
            option.push('-t', this.configs.T)
        }
        if (this.configs.TP != null && this.configs.TP > 0) {
            option.push('-tp', this.configs.TP)
        }
        if (this.configs.URL != null && this.configs.URL != '') {
            option.push('-url', this.configs.URL)
        }

        this.logger.debug("path:" + __dirname)
        // 拼接工作目录
        const workdir = path.join(__dirname, 'assets');
        const v4List= path.join(__dirname,'configs','ip.txt')
        const v6List= path.join(__dirname,'configs','ipv6.txt')
        this.logger.info("开始V4测速")
        await this.execSpeedTest(workdir, ['-o', this.configs.FILE,'-f',v4List, ...option])
        this.logger.info('V4测速完成!');

        let ip4:Array<string> = await FileUtils.readCsv2IpArray(path.join(workdir, this.configs.FILE), this.configs.SELECT_NUM);
        if (this.configs.ENABLE_V6){
            this.logger.info("V6测速......")
            await this.execSpeedTest(workdir,['-o', this.configs.FILE6,'-f',v6List,...option]);
            this.logger.info('V6测速完成!');
            let ip6:Array<string>=await FileUtils.readCsv2IpArray(path.join(workdir, this.configs.FILE6),this.configs.SELECT_NUM)
            this.logger.debug("ipv6->:"+ip6)
            await this.update2Local(ip4,ip6,domain)
        }else {
            await this.update2Local(ip4,[] ,domain)
        }

        this.logger.info('任务结束！')
    }
}