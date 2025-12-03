import { useState, useEffect } from 'react';
import { ConfigProvider, Layout, Typography, Button, Space, message, Card, Modal, Form, Input } from 'antd';
import { DownloadOutlined, FileExcelOutlined } from '@ant-design/icons';
import zhCN from 'antd/locale/zh_CN';
import LLMConfigForm from './components/LLMConfigForm';
import PersonList from './components/PersonList';
import type { PersonInfo, LLMConfig } from './types';
import { exportToExcel, exportSummaryToExcel } from './utils/export';
import type { TravelInfo } from './utils/export';
import 'dayjs/locale/zh-cn';

const { Header, Content } = Layout;
const { Title } = Typography;
const { TextArea } = Input;

function App() {
  // 从 localStorage 加载配置
  const loadConfig = (): LLMConfig => {
    const saved = localStorage.getItem('llm_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { baseUrl: '', apiKey: '', modelName: '' };
      }
    }
    return { baseUrl: '', apiKey: '', modelName: '' };
  };

  // 从 localStorage 加载人员数据
  const loadPersons = (): PersonInfo[] => {
    const saved = localStorage.getItem('persons_data');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return [];
      }
    }
    return [];
  };

  // 从 localStorage 加载差旅信息
  const loadTravelInfo = (): TravelInfo => {
    const saved = localStorage.getItem('travel_info');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return { competitionName: '', time: '', location: '', teamName: '', remarks: '' };
      }
    }
    return { competitionName: '', time: '', location: '', teamName: '', remarks: '' };
  };

  const [llmConfig, setLlmConfig] = useState<LLMConfig>(loadConfig);
  const [persons, setPersons] = useState<PersonInfo[]>(loadPersons);
  const [travelInfo, setTravelInfo] = useState<TravelInfo>(loadTravelInfo);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportForm] = Form.useForm();

  // 保存人员数据到 localStorage
  useEffect(() => {
    const dataToSave = persons.map(p => ({
      ...p,
      invoices: p.invoices.map(inv => ({
        ...inv,
        file: undefined,
      })),
    }));
    localStorage.setItem('persons_data', JSON.stringify(dataToSave));
  }, [persons]);

  // 导出明细
  const handleExportDetail = () => {
    const hasInvoices = persons.some(p =>
      p.invoices.some(inv => inv.parseStatus === 'success')
    );
    if (!hasInvoices) {
      message.warning('没有可导出的发票数据');
      return;
    }
    exportToExcel(persons, '发票明细');
    message.success('导出成功');
  };

  // 打开导出汇总弹窗
  const handleOpenExportModal = () => {
    const hasInvoices = persons.some(p =>
      p.invoices.some(inv => inv.parseStatus === 'success')
    );
    if (!hasInvoices) {
      message.warning('没有可导出的发票数据');
      return;
    }
    exportForm.setFieldsValue(travelInfo);
    setIsExportModalOpen(true);
  };

  // 导出汇总
  const handleExportSummary = () => {
    exportForm.validateFields().then((values: TravelInfo) => {
      setTravelInfo(values);
      localStorage.setItem('travel_info', JSON.stringify(values));
      exportSummaryToExcel(persons, values, '差旅明细');
      message.success('导出成功');
      setIsExportModalOpen(false);
    });
  };

  // 计算统计信息
  const getStats = () => {
    let totalInvoices = 0;
    let successInvoices = 0;
    let totalAmount = 0;

    persons.forEach(p => {
      p.invoices.forEach(inv => {
        totalInvoices++;
        if (inv.parseStatus === 'success') {
          successInvoices++;
          totalAmount += inv.amount || 0;
        }
      });
    });

    return { totalInvoices, successInvoices, totalAmount };
  };

  const stats = getStats();

  return (
    <ConfigProvider locale={zhCN}>
      <Layout style={{ minHeight: '100vh' }}>
        <Header style={{ background: '#fff', padding: '0 24px', borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '100%' }}>
            <Title level={3} style={{ margin: 0 }}>
              发票自动整理系统
            </Title>
            <Space>
              <Button icon={<FileExcelOutlined />} onClick={handleExportDetail}>
                导出明细
              </Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleOpenExportModal}>
                导出差旅汇总
              </Button>
            </Space>
          </div>
        </Header>

        <Content style={{ padding: 24, background: '#f5f5f5' }}>
          <LLMConfigForm config={llmConfig} onConfigChange={setLlmConfig} />

          {/* 统计卡片 */}
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space size="large">
              <span>人员数量: <strong>{persons.length}</strong></span>
              <span>发票总数: <strong>{stats.totalInvoices}</strong></span>
              <span>已解析: <strong>{stats.successInvoices}</strong></span>
              <span>总金额: <strong style={{ color: '#1890ff' }}>¥{stats.totalAmount.toFixed(2)}</strong></span>
            </Space>
          </Card>

          <Card title="人员及发票列表">
            <PersonList
              persons={persons}
              onPersonsChange={setPersons}
              llmConfig={llmConfig}
            />
          </Card>
        </Content>
      </Layout>

      {/* 导出差旅汇总弹窗 */}
      <Modal
        title="导出差旅明细"
        open={isExportModalOpen}
        onOk={handleExportSummary}
        onCancel={() => setIsExportModalOpen(false)}
        okText="导出"
        cancelText="取消"
        width={500}
      >
        <Form form={exportForm} layout="vertical">
          <Form.Item
            name="competitionName"
            label="竞赛名称"
            rules={[{ required: true, message: '请输入竞赛名称' }]}
          >
            <Input placeholder="请输入竞赛名称" />
          </Form.Item>
          <Form.Item
            name="time"
            label="时间"
            rules={[{ required: true, message: '请输入时间' }]}
          >
            <Input placeholder="如：2024年3月15日-17日" />
          </Form.Item>
          <Form.Item
            name="location"
            label="地点"
            rules={[{ required: true, message: '请输入地点' }]}
          >
            <Input placeholder="请输入比赛地点" />
          </Form.Item>
          <Form.Item
            name="teamName"
            label="队伍名称"
            rules={[{ required: true, message: '请输入队伍名称' }]}
          >
            <Input placeholder="请输入队伍名称" />
          </Form.Item>
          <Form.Item name="remarks" label="备注">
            <TextArea placeholder="问题反馈等备注信息（选填）" rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </ConfigProvider>
  );
}

export default App;
