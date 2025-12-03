import React from 'react';
import { Form, Input, Card, Button, message } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import type { LLMConfig } from '../types';

interface LLMConfigFormProps {
  config: LLMConfig;
  onConfigChange: (config: LLMConfig) => void;
}

const LLMConfigForm: React.FC<LLMConfigFormProps> = ({ config, onConfigChange }) => {
  const [form] = Form.useForm();

  const handleSave = () => {
    const values = form.getFieldsValue();
    onConfigChange(values);
    // 保存到 localStorage
    localStorage.setItem('llm_config', JSON.stringify(values));
    message.success('配置已保存');
  };

  return (
    <Card
      title={
        <span>
          <SettingOutlined /> LLM 配置
        </span>
      }
      size="small"
      style={{ marginBottom: 16 }}
    >
      <Form
        form={form}
        layout="inline"
        initialValues={config}
        style={{ gap: 8 }}
      >
        <Form.Item
          name="baseUrl"
          label="Base URL"
          rules={[{ required: true, message: '请输入Base URL' }]}
        >
          <Input placeholder="https://api.openai.com/v1" style={{ width: 250 }} />
        </Form.Item>

        <Form.Item
          name="apiKey"
          label="API Key"
          rules={[{ required: true, message: '请输入API Key' }]}
        >
          <Input.Password placeholder="sk-..." style={{ width: 200 }} />
        </Form.Item>

        <Form.Item
          name="modelName"
          label="Model"
          rules={[{ required: true, message: '请输入Model名称' }]}
        >
          <Input placeholder="gpt-4o" style={{ width: 150 }} />
        </Form.Item>

        <Form.Item>
          <Button type="primary" onClick={handleSave}>
            保存配置
          </Button>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default LLMConfigForm;
