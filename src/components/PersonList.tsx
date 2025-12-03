import React, { useState } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Upload,
  Space,
  Tag,
  Popconfirm,
  message,
  Select,
  InputNumber,
  DatePicker,
  Image,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EditOutlined,
  InboxOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import type { PersonInfo, InvoiceInfo, LLMConfig } from '../types';
import { InvoiceTypeLabels } from '../types';
import { fileToBase64, parseInvoiceWithLLM } from '../utils/llm';

const { Dragger } = Upload;

interface PersonListProps {
  persons: PersonInfo[];
  onPersonsChange: (persons: PersonInfo[] | ((prev: PersonInfo[]) => PersonInfo[])) => void;
  llmConfig: LLMConfig;
}

const PersonList: React.FC<PersonListProps> = ({ persons, onPersonsChange, llmConfig }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPerson, setEditingPerson] = useState<PersonInfo | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<{ personId: string; invoice: InvoiceInfo } | null>(null);
  const [form] = Form.useForm();
  const [invoiceForm] = Form.useForm();

  // 生成唯一ID
  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // 添加/编辑人员
  const handleAddPerson = () => {
    setEditingPerson(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEditPerson = (person: PersonInfo) => {
    setEditingPerson(person);
    form.setFieldsValue({
      name: person.name,
      employeeId: person.employeeId,
    });
    setIsModalOpen(true);
  };

  const handleModalOk = () => {
    form.validateFields().then((values) => {
      if (editingPerson) {
        // 编辑现有人员
        const updatedPersons = persons.map((p) =>
          p.id === editingPerson.id
            ? { ...p, name: values.name, employeeId: values.employeeId }
            : p
        );
        onPersonsChange(updatedPersons);
      } else {
        // 添加新人员
        const newPerson: PersonInfo = {
          id: generateId(),
          name: values.name,
          employeeId: values.employeeId,
          invoices: [],
        };
        onPersonsChange([...persons, newPerson]);
      }
      setIsModalOpen(false);
      form.resetFields();
    });
  };

  // 删除人员
  const handleDeletePerson = (personId: string) => {
    onPersonsChange(persons.filter((p) => p.id !== personId));
  };

  // 处理发票上传
  const handleInvoiceUpload = async (personId: string, file: File) => {
    const invoiceId = generateId();
    const invoice: InvoiceInfo = {
      id: invoiceId,
      fileName: file.name,
      type: null,
      amount: null,
      date: null,
      description: null,
      file,
      parseStatus: 'pending',
    };

    // 转换为base64
    try {
      invoice.imageBase64 = await fileToBase64(file);
    } catch {
      message.error('文件读取失败');
      return;
    }

    // 添加发票到人员
    onPersonsChange((prev) =>
      prev.map((p) =>
        p.id === personId ? { ...p, invoices: [...p.invoices, invoice] } : p
      )
    );

    // 自动解析发票
    await parseInvoice(personId, invoiceId, invoice);
  };

  // 解析发票
  const parseInvoice = async (personId: string, invoiceId: string, invoice: InvoiceInfo) => {
    // 检查LLM配置
    if (!llmConfig.baseUrl || !llmConfig.apiKey || !llmConfig.modelName) {
      message.warning('请先配置LLM参数');
      return;
    }

    // 更新状态为解析中
    onPersonsChange((prev) =>
      prev.map((p) =>
        p.id === personId
          ? {
              ...p,
              invoices: p.invoices.map((inv) =>
                inv.id === invoiceId ? { ...inv, parseStatus: 'parsing' as const } : inv
              ),
            }
          : p
      )
    );

    try {
      const result = await parseInvoiceWithLLM(llmConfig, invoice);

      onPersonsChange((prev) =>
        prev.map((p) =>
          p.id === personId
            ? {
                ...p,
                invoices: p.invoices.map((inv) =>
                  inv.id === invoiceId
                    ? { ...inv, ...result, parseStatus: 'success' as const }
                    : inv
                ),
              }
            : p
        )
      );
      message.success(`发票 ${invoice.fileName} 解析成功`);
    } catch (error) {
      onPersonsChange((prev) =>
        prev.map((p) =>
          p.id === personId
            ? {
                ...p,
                invoices: p.invoices.map((inv) =>
                  inv.id === invoiceId
                    ? {
                        ...inv,
                        parseStatus: 'error' as const,
                        errorMessage: error instanceof Error ? error.message : '解析失败',
                      }
                    : inv
                ),
              }
            : p
        )
      );
      message.error(`发票解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  };

  // 删除发票
  const handleDeleteInvoice = (personId: string, invoiceId: string) => {
    const updatedPersons = persons.map((p) =>
      p.id === personId
        ? { ...p, invoices: p.invoices.filter((inv) => inv.id !== invoiceId) }
        : p
    );
    onPersonsChange(updatedPersons);
  };

  // 重新解析发票
  const handleReparse = (personId: string, invoiceId: string) => {
    const person = persons.find((p) => p.id === personId);
    const invoice = person?.invoices.find((inv) => inv.id === invoiceId);
    if (invoice) {
      parseInvoice(personId, invoiceId, invoice);
    }
  };

  // 编辑发票
  const handleEditInvoice = (personId: string, invoice: InvoiceInfo) => {
    setEditingInvoice({ personId, invoice });
    invoiceForm.setFieldsValue({
      type: invoice.type,
      amount: invoice.amount,
      date: invoice.date ? dayjs(invoice.date) : null,
      description: invoice.description,
    });
  };

  const handleInvoiceEditOk = () => {
    invoiceForm.validateFields().then((values) => {
      if (!editingInvoice) return;

      const updatedPersons = persons.map((p) =>
        p.id === editingInvoice.personId
          ? {
              ...p,
              invoices: p.invoices.map((inv) =>
                inv.id === editingInvoice.invoice.id
                  ? {
                      ...inv,
                      type: values.type,
                      amount: values.amount,
                      date: values.date ? values.date.format('YYYY-MM-DD') : null,
                      description: values.description,
                      parseStatus: 'success' as const,
                    }
                  : inv
              ),
            }
          : p
      );
      onPersonsChange(updatedPersons);
      setEditingInvoice(null);
      invoiceForm.resetFields();
    });
  };

  // 渲染解析状态
  const renderParseStatus = (invoice: InvoiceInfo, personId: string) => {
    switch (invoice.parseStatus) {
      case 'pending':
        return <Tag>待解析</Tag>;
      case 'parsing':
        return (
          <Tag icon={<LoadingOutlined spin />} color="processing">
            解析中
          </Tag>
        );
      case 'success':
        return (
          <Tag icon={<CheckCircleOutlined />} color="success">
            已解析
          </Tag>
        );
      case 'error':
        return (
          <Space>
            <Tag icon={<CloseCircleOutlined />} color="error">
              解析失败
            </Tag>
            <Button size="small" onClick={() => handleReparse(personId, invoice.id)}>
              重试
            </Button>
          </Space>
        );
    }
  };

  // 表格列定义
  const columns = [
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      width: 100,
    },
    {
      title: '工号/学号',
      dataIndex: 'employeeId',
      key: 'employeeId',
      width: 120,
    },
    {
      title: '发票',
      key: 'invoices',
      render: (_: unknown, record: PersonInfo) => (
        <Space direction="vertical" style={{ width: '100%' }}>
          {record.invoices.map((invoice) => (
            <div
              key={invoice.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '4px 8px',
                background: '#fafafa',
                borderRadius: 4,
              }}
            >
              {invoice.imageBase64 && (
                <Image
                  src={`data:image/jpeg;base64,${invoice.imageBase64}`}
                  width={40}
                  height={40}
                  style={{ objectFit: 'cover', borderRadius: 4 }}
                  preview={{
                    src: `data:image/jpeg;base64,${invoice.imageBase64}`,
                  }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: '#666' }}>{invoice.fileName}</div>
                {invoice.parseStatus === 'success' && (
                  <div style={{ fontSize: 12 }}>
                    <Tag color="blue">{invoice.type ? InvoiceTypeLabels[invoice.type] : '未知'}</Tag>
                    <span style={{ marginLeft: 4 }}>¥{invoice.amount || 0}</span>
                    <span style={{ marginLeft: 8, color: '#999' }}>{invoice.date}</span>
                  </div>
                )}
              </div>
              {renderParseStatus(invoice, record.id)}
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEditInvoice(record.id, invoice)}
              />
              <Popconfirm
                title="确定删除这张发票吗？"
                onConfirm={() => handleDeleteInvoice(record.id, invoice.id)}
              >
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </div>
          ))}
          <Dragger
            accept="image/*,.pdf"
            showUploadList={false}
            beforeUpload={(file) => {
              handleInvoiceUpload(record.id, file as File);
              return false;
            }}
            multiple
            style={{ padding: '8px 16px' }}
          >
            <p className="ant-upload-drag-icon" style={{ margin: '8px 0' }}>
              <InboxOutlined style={{ fontSize: 24, color: '#1890ff' }} />
            </p>
            <p className="ant-upload-text" style={{ margin: 0, fontSize: 12 }}>
              点击或拖拽文件上传发票
            </p>
            <p className="ant-upload-hint" style={{ margin: 0, fontSize: 11, color: '#999' }}>
              支持 PDF、图片，可批量上传
            </p>
          </Dragger>
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_: unknown, record: PersonInfo) => (
        <Space>
          <Button size="small" onClick={() => handleEditPerson(record)}>
            编辑
          </Button>
          <Popconfirm
            title="确定删除这个人员吗？"
            description="删除后该人员的所有发票也会被删除"
            onConfirm={() => handleDeletePerson(record.id)}
          >
            <Button size="small" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAddPerson}>
          添加人员
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={persons}
        rowKey="id"
        pagination={false}
        locale={{ emptyText: '暂无人员，请点击"添加人员"按钮添加' }}
      />

      {/* 添加/编辑人员弹窗 */}
      <Modal
        title={editingPerson ? '编辑人员' : '添加人员'}
        open={isModalOpen}
        onOk={handleModalOk}
        onCancel={() => {
          setIsModalOpen(false);
          form.resetFields();
        }}
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="姓名"
            rules={[{ required: true, message: '请输入姓名' }]}
          >
            <Input placeholder="请输入姓名" />
          </Form.Item>
          <Form.Item
            name="employeeId"
            label="工号/学号"
            rules={[{ required: true, message: '请输入工号/学号' }]}
          >
            <Input placeholder="请输入工号/学号" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑发票弹窗 */}
      <Modal
        title="编辑发票信息"
        open={!!editingInvoice}
        onOk={handleInvoiceEditOk}
        onCancel={() => {
          setEditingInvoice(null);
          invoiceForm.resetFields();
        }}
        width={500}
      >
        {editingInvoice?.invoice.imageBase64 && (
          <div style={{ marginBottom: 16, textAlign: 'center' }}>
            <Image
              src={`data:image/jpeg;base64,${editingInvoice.invoice.imageBase64}`}
              style={{ maxHeight: 200 }}
            />
          </div>
        )}
        <Form form={invoiceForm} layout="vertical">
          <Form.Item
            name="type"
            label="发票类型"
            rules={[{ required: true, message: '请选择发票类型' }]}
          >
            <Select placeholder="请选择发票类型">
              <Select.Option value="intercity_transport">城市间交通</Select.Option>
              <Select.Option value="intracity_transport">城市内交通</Select.Option>
              <Select.Option value="accommodation">住宿</Select.Option>
              <Select.Option value="registration_fee">报名费</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="amount"
            label="金额"
            rules={[{ required: true, message: '请输入金额' }]}
          >
            <InputNumber
              placeholder="请输入金额"
              style={{ width: '100%' }}
              prefix="¥"
              precision={2}
            />
          </Form.Item>
          <Form.Item name="date" label="日期">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea placeholder="请输入描述" rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default PersonList;
