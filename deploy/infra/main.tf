terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

provider "aws" {
  region = var.region
}

resource "aws_lightsail_instance" "app" {
  name              = "gymtrack"
  availability_zone = var.availability_zone
  blueprint_id      = "ubuntu_24_04"
  bundle_id         = "micro_3_0"
  ip_address_type   = "ipv4"

  add_on {
    type          = "AutoSnapshot"
    snapshot_time = "08:00"
    status        = "Enabled"
  }

  tags = {
    Project     = "GymTrack"
    Environment = "production"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_lightsail_static_ip" "app" {
  name = "gymtrack"
}

resource "aws_lightsail_static_ip_attachment" "app" {
  static_ip_name = aws_lightsail_static_ip.app.name
  instance_name  = aws_lightsail_instance.app.name
}

resource "aws_lightsail_instance_public_ports" "app" {
  instance_name = aws_lightsail_instance.app.name

  port_info {
    protocol  = "tcp"
    from_port = 80
    to_port   = 80
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    protocol  = "tcp"
    from_port = 443
    to_port   = 443
    cidrs     = ["0.0.0.0/0"]
  }

  port_info {
    protocol         = "tcp"
    from_port        = 22
    to_port          = 22
    cidrs            = var.ssh_cidrs
    cidr_list_aliases = ["lightsail-connect"]
  }
}

variable "region" {
  type    = string
  default = "us-east-1"
}

variable "availability_zone" {
  type    = string
  default = "us-east-1a"
}

variable "ssh_cidrs" {
  description = "Optional administrator IPv4 CIDRs. Browser SSH is also enabled."
  type        = list(string)
  default     = []
}

output "public_ip" {
  value = aws_lightsail_static_ip.app.ip_address
}

output "instance_name" {
  value = aws_lightsail_instance.app.name
}
