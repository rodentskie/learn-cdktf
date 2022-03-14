import { Construct } from "constructs";
import { App, TerraformStack, S3Backend } from "cdktf";
import { AwsProvider, ec2 } from "@cdktf/provider-aws";

class MyStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    new AwsProvider(this, "AWS", {
      region: "ap-southeast-1",
    });

    new ec2.Eip(this, "eip_dev", {
      vpc: true,
      tags: {
        name: "rod-test",
        environment: "test",
      },
    });

    new S3Backend(this, {
      bucket: "onewallet-cdktf-test",
      key: "cdktf/eip.json",
      region: "ap-southeast-1",
    });
  }
}

const app = new App();
new MyStack(app, "aws_instance");

app.synth();
